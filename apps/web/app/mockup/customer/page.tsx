'use client';

import { useState } from 'react';

/**
 * Static mobile mockup — customer persona. Hardcoded data, no API calls.
 * View at /mockup/customer (design reference only, not wired to the backend).
 */

const PINE = '#1f4037';
const PINE_SOFT = '#315c4f';
const CREAM = '#faf8f2';
const INK = '#20211f';
const STONE = '#78716c';

const services = [
  { name: 'Haircut', dur: '30 min', price: '$35' },
  { name: 'Haircut + beard', dur: '45 min', price: '$50' },
  { name: 'Beard trim', dur: '15 min', price: '$20' },
  { name: 'Kids cut', dur: '20 min', price: '$25' },
];

// Everyone in line, shown privacy-safe (initial only), each with their projected serving time —
// including the people behind you, so the whole line is transparent.
const line = [
  { initial: 'A', tag: 'In the chair', service: 'Fade + beard', time: 'now', now: true },
  { initial: 'P', tag: 'Up next', service: 'Haircut', time: '~9:58' },
  { initial: 'C', tag: 'Waiting', service: 'Kids cut', time: '~10:01' },
  { initial: 'YOU', tag: 'Your turn', service: 'Haircut + beard · Marcus', time: '~10:03', you: true },
  { initial: 'M', tag: 'Waiting', service: 'Line-up', time: '~10:20' },
  { initial: 'R', tag: 'Waiting', service: 'Haircut', time: '~10:35' },
];

export default function CustomerMockup() {
  const [joined, setJoined] = useState(true);

  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', padding: '16px', background: '#efece4' }}>
      <div style={{ width: '100%', maxWidth: 402, height: 844, maxHeight: '96vh', background: CREAM, borderRadius: 34, overflow: 'hidden', boxShadow: '0 30px 70px rgba(31,64,55,.22), 0 4px 12px rgba(31,64,55,.12)', border: '1px solid rgba(31,64,55,.10)', display: 'flex', flexDirection: 'column', position: 'relative' }}>

        {/* Status bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 22px 2px', fontSize: 12, fontWeight: 600, color: INK }}>
          <span>9:41</span>
          <span style={{ letterSpacing: '.1em' }}>●●●●  ⌁  ▮</span>
        </div>

        {/* Shop header */}
        <header style={{ padding: '10px 20px 12px', borderBottom: '1px solid rgba(31,64,55,.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: 13, display: 'grid', placeItems: 'center', color: '#fffaf0', fontWeight: 800, background: `linear-gradient(145deg, ${PINE_SOFT}, ${PINE})` }}>JJ</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 16, color: INK }}>JJ&apos;s Barbers</div>
              <div style={{ fontSize: 12.5, color: STONE }}>Novi · ★ 4.9 (312) · 0.4 mi</div>
            </div>
          </div>
        </header>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px 40px' }}>
          {joined ? (
            <>
              {/* Live status hero — lead with the projected service time, not a raw countdown */}
              <div style={{ borderRadius: 22, padding: '22px 20px', color: '#fffaf0', background: `linear-gradient(160deg, ${PINE_SOFT}, ${PINE})`, boxShadow: '0 16px 34px rgba(31,64,55,.28)', position: 'relative', overflow: 'hidden' }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.1em', opacity: 0.8 }}>You&apos;re up around</div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, marginTop: 6 }}>
                  <div style={{ fontSize: 52, fontWeight: 800, lineHeight: 1, letterSpacing: '-.03em' }}>10:03<span style={{ fontSize: 22, fontWeight: 700, marginLeft: 6 }}>AM</span></div>
                </div>
                <div style={{ marginTop: 8, fontSize: 14, opacity: 0.9 }}>You&apos;re <strong style={{ fontWeight: 700 }}>#3</strong> in line · about 22 min</div>

                {/* progress dots */}
                <div style={{ display: 'flex', gap: 6, marginTop: 18 }}>
                  {[0, 1, 2, 3, 4].map((i) => (
                    <div key={i} style={{ flex: 1, height: 5, borderRadius: 99, background: i < 2 ? '#fffaf0' : 'rgba(255,250,240,.28)' }} />
                  ))}
                </div>
                <div style={{ marginTop: 12, fontSize: 12.5, opacity: 0.85, display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span>✓</span> We&apos;ll text you about 10 min before — feel free to step out.
                </div>
              </div>

              {/* The whole line — every customer's projected serving time, you highlighted */}
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', margin: '22px 2px 10px' }}>
                <h2 style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: '#3a4a42', margin: 0 }}>The line today</h2>
                <span style={{ fontSize: 11.5, color: STONE }}>serving times</span>
              </div>
              <div style={{ background: '#fff', borderRadius: 16, border: '1px solid rgba(31,64,55,.09)', overflow: 'hidden' }}>
                {line.map((p, i) => (
                  <div key={`${p.initial}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderTop: i ? '1px solid rgba(31,64,55,.07)' : 'none', background: p.you ? '#f4f7f5' : 'transparent' }}>
                    <div style={{ width: 34, height: 34, borderRadius: 10, background: p.you ? PINE : p.now ? '#e4efe9' : '#f1efe8', color: p.you ? '#fffaf0' : PINE, display: 'grid', placeItems: 'center', fontWeight: p.you ? 800 : 700, fontSize: p.you ? 12 : 13, flex: 'none' }}>{p.initial}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: p.you ? 700 : 650, color: p.you || p.now ? PINE : STONE, textTransform: 'uppercase', letterSpacing: '.04em' }}>{p.tag}</div>
                      <div style={{ fontSize: 13.5, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.service}</div>
                    </div>
                    <div style={{ fontSize: p.you ? 15 : 13.5, fontWeight: p.you ? 800 : 600, color: p.you ? PINE : p.now ? '#3f7d5f' : INK, fontVariantNumeric: 'tabular-nums', flex: 'none' }}>{p.time}</div>
                  </div>
                ))}
              </div>

              {/* Your visit */}
              <h2 style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: '#3a4a42', margin: '22px 2px 10px' }}>Your visit</h2>
              <div style={{ background: '#fff', borderRadius: 16, border: '1px solid rgba(31,64,55,.09)', overflow: 'hidden' }}>
                {[
                  { k: 'Service', v: 'Haircut + beard' },
                  { k: 'Barber', v: 'Marcus (requested)' },
                  { k: 'Checked in', v: '9:32 AM' },
                  { k: 'Estimated total', v: '$50 + tip' },
                ].map((row, i) => (
                  <div key={row.k} style={{ display: 'flex', justifyContent: 'space-between', padding: '13px 16px', borderTop: i ? '1px solid rgba(31,64,55,.07)' : 'none' }}>
                    <span style={{ fontSize: 13.5, color: STONE }}>{row.k}</span>
                    <span style={{ fontSize: 13.5, fontWeight: 600, color: INK }}>{row.v}</span>
                  </div>
                ))}
              </div>

              <button onClick={() => setJoined(false)} style={{ width: '100%', marginTop: 16, padding: '14px', borderRadius: 14, border: '1px solid rgba(156,59,57,.35)', background: '#fff', color: '#9c3b39', fontWeight: 650, fontSize: 15, cursor: 'pointer' }}>Leave the line</button>
            </>
          ) : (
            <>
              {/* Booking entry */}
              <div style={{ borderRadius: 20, padding: '20px', background: '#fff', border: '1px solid rgba(31,64,55,.1)', boxShadow: '0 8px 22px rgba(31,64,55,.06)' }}>
                <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: '-.02em', color: '#202722' }}>Skip the wait</div>
                <div style={{ fontSize: 13.5, color: STONE, marginTop: 4 }}>4 people in line now · ~35 min wait. Join remotely or book a time.</div>
              </div>

              <h2 style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: '#3a4a42', margin: '22px 2px 10px' }}>Choose a service</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {services.map((s, i) => (
                  <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#fff', borderRadius: 14, padding: '13px 15px', border: i === 1 ? `1.5px solid ${PINE}` : '1px solid rgba(31,64,55,.09)' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 650, fontSize: 14.5, color: INK }}>{s.name}</div>
                      <div style={{ fontSize: 12.5, color: STONE }}>{s.dur}</div>
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: PINE, fontVariantNumeric: 'tabular-nums' }}>{s.price}</div>
                    {i === 1 && <span style={{ fontSize: 16, color: PINE }}>◉</span>}
                  </div>
                ))}
              </div>

              <button onClick={() => setJoined(true)} style={{ width: '100%', marginTop: 22, padding: '16px', borderRadius: 14, border: 'none', background: `linear-gradient(145deg, ${PINE_SOFT}, ${PINE})`, color: '#fffaf0', fontWeight: 700, fontSize: 16, cursor: 'pointer', boxShadow: '0 10px 24px rgba(31,64,55,.25)' }}>Join the line — ~35 min</button>
              <button style={{ width: '100%', marginTop: 10, padding: '14px', borderRadius: 14, border: '1px solid rgba(31,64,55,.18)', background: '#fff', color: PINE, fontWeight: 650, fontSize: 15, cursor: 'pointer' }}>Book a time instead</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
