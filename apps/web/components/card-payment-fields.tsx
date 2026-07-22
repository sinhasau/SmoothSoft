'use client';

import { useEffect, useRef, useState, type MutableRefObject } from 'react';

export interface BrowserPaymentConfig {
  activeProcessor: 'stripe' | 'square' | 'external';
  configured: boolean;
  mode: 'integrated' | 'manual';
  stripePublishableKey?: string | null;
  stripeConnectedAccountId?: string | null;
  squareApplicationId?: string | null;
  squareLocationId?: string | null;
  squareEnvironment?: 'sandbox' | 'production';
  showDiscountAtCheckout: boolean;
}

const scriptLoads = new Map<string, Promise<void>>();

function loadScript(src: string) {
  const existing = scriptLoads.get(src);
  if (existing) return existing;
  const promise = new Promise<void>((resolve, reject) => {
    const present = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (present?.dataset.loaded === 'true') return resolve();
    const script = present ?? document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => { script.dataset.loaded = 'true'; resolve(); };
    script.onerror = () => reject(new Error('The secure card form could not be loaded. Check the network connection and try again.'));
    if (!present) document.head.appendChild(script);
  });
  scriptLoads.set(src, promise);
  return promise;
}

export function CardPaymentFields({ config, tokenizerRef, onReady }: { config: BrowserPaymentConfig; tokenizerRef: MutableRefObject<null | (() => Promise<string>)>; onReady: (ready: boolean) => void }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    let destroy: (() => void | Promise<void>) | undefined;
    tokenizerRef.current = null;
    onReady(false);
    setError(null);

    async function mount() {
      if (!config.configured || !mountRef.current) return;
      try {
        if (config.activeProcessor === 'stripe') {
          if (!config.stripePublishableKey) throw new Error('Stripe needs a publishable key in Settings.');
          await loadScript('https://js.stripe.com/v3/');
          if (disposed || !mountRef.current) return;
          const stripeFactory = (window as any).Stripe;
          if (!stripeFactory) throw new Error('Stripe did not initialize.');
          const stripe = stripeFactory(config.stripePublishableKey, config.stripeConnectedAccountId ? { stripeAccount: config.stripeConnectedAccountId } : undefined);
          const elements = stripe.elements();
          const card = elements.create('card', { style: { base: { color: '#202722', fontSize: '16px', '::placeholder': { color: '#9ca3af' } }, invalid: { color: '#b91c1c' } } });
          card.mount(mountRef.current);
          card.on('change', (event: { error?: { message?: string }; complete?: boolean }) => {
            if (!disposed) {
              setError(event.error?.message ?? null);
              onReady(Boolean(event.complete) && !event.error);
            }
          });
          tokenizerRef.current = async () => {
            const result = await stripe.createPaymentMethod({ type: 'card', card });
            if (result.error) throw new Error(result.error.message ?? 'The card could not be tokenized.');
            if (!result.paymentMethod?.id) throw new Error('Stripe did not return a payment method.');
            return result.paymentMethod.id;
          };
          destroy = () => card.destroy();
        } else if (config.activeProcessor === 'square') {
          if (!config.squareApplicationId || !config.squareLocationId) throw new Error('Square needs an application and location ID in Settings.');
          const squareUrl = config.squareEnvironment === 'production' ? 'https://web.squarecdn.com/v1/square.js' : 'https://sandbox.web.squarecdn.com/v1/square.js';
          await loadScript(squareUrl);
          if (disposed || !mountRef.current) return;
          const square = (window as any).Square;
          if (!square) throw new Error('Square did not initialize.');
          const payments = square.payments(config.squareApplicationId, config.squareLocationId);
          const card = await payments.card();
          await card.attach(mountRef.current);
          tokenizerRef.current = async () => {
            const result = await card.tokenize();
            if (result.status !== 'OK' || !result.token) throw new Error(result.errors?.[0]?.message ?? 'Square could not tokenize the card.');
            return result.token;
          };
          onReady(true);
          destroy = () => card.destroy();
        }
      } catch (err) {
        if (!disposed) setError(err instanceof Error ? err.message : 'The secure card form could not be initialized.');
      }
    }

    void mount();
    return () => {
      disposed = true;
      tokenizerRef.current = null;
      onReady(false);
      void destroy?.();
    };
  }, [config, onReady, tokenizerRef]);

  return <div className="mb-3 rounded-xl border border-black/10 bg-white p-3"><div ref={mountRef} aria-label={`${config.activeProcessor === 'stripe' ? 'Stripe' : 'Square'} secure card details`} className="min-h-10 py-2" />{!config.configured && <p className="text-xs text-amber-700">Finish the {config.activeProcessor === 'stripe' ? 'Stripe' : 'Square'} connection in Advanced Settings before accepting card payments.</p>}{error && <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}<p className="mt-2 text-[11px] text-gray-400">Card details are tokenized by {config.activeProcessor === 'stripe' ? 'Stripe' : 'Square'} and never stored by SmoothSoft.</p></div>;
}
