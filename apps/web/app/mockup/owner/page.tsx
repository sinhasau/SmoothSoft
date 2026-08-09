'use client';

import { useState } from 'react';

/**
 * Static mobile mockup — owner/manager persona. Hardcoded data, no API calls.
 * View at /mockup/owner (design reference only, not wired to the backend).
 */

const PINE = '#1f4037';
const PINE_SOFT = '#315c4f';
const CREAM = '#faf8f2';
const INK = '#20211f';
const STONE = '#78716c';

const queue = [
  { name: 'Andre W.', service: 'Fade + beard', staff: 'Marcus', status: 'In chair', tone: 'pine', timeLabel: 'Frees chair', time: '~9:56' },
  { name: 'Priya S.', service: 'Haircut', staff: 'Dana', status: 'Next up', tone: 'amber', timeLabel: 'Starts', time: '~9:58' },
  { name: 'Cole R.', service: 'Kids cut', staff: 'Any', status: 'Waiting', tone: 'stone', timeLabel: 'Starts', time: '~10:00' },
  { name: 'Marcus J.', service: 'Line-up', staff: 'Dana', status: 'Waiting', tone: 'stone', timeLabel: 'Starts', time: '~10:14' },
];

const alerts = [
  { icon: '◑', title: 'Pay rate changed mid-period', body: 'Dana — review before running payroll.', tone: 'amber' },
  { icon: '▤', title: 'Low stock', body: 'Beard oil — 2 left.', tone: 'rose' },
];

const tabs = ['Home', 'Queue', 'Schedule', 'Reports', 'More'];

function toneStyle(tone: string) {
  switch (tone) {
    case 'pine': return { bg: '#e4efe9', fg: '#1f4037' };
    case 'amber': return { bg: '#f8ecd0', fg: '#8a5a12' };
    case 'rose': return { bg: '#f7e2df', fg: '#9c3b39' };
    default: return { bg: '#eeece6', fg: '#6b6660' };
  }
}

export default function OwnerMockup() {
  const [tab, setTab] = useState('Home');
  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '100dvh', padding: '16px', background: '#efece4' }}>
      <div style={{ width: '100%', maxWidth: 402, height: 844, maxHeight: '96dvh', background: CREAM, borderRadius: 34, overflow: 'hidden', boxShadow: '0 30px 70px rgba(31,64,55,.22), 0 4px 12px rgba(31,64,55,.12)', border: '1px solid rgba(31,64,55,.10)', display: 'flex', flexDirection: 'column', position: 'relative' }}>

        {/* Status bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 22px 2px', fontSize: 12, fontWeight: 600, color: INK }}>
          <span>9:41</span>
          <span style={{ letterSpacing: '.1em' }}>●●●●  ⌁  ▮</span>
        </div>

        {/* Header */}
        <header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 18px 14px' }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, display: 'grid', placeItems: 'center', color: '#fffaf0', fontWeight: 800, fontSize: 15, background: `linear-gradient(145deg, ${PINE_SOFT}, ${PINE})`, boxShadow: '0 5px 14px rgba(31,64,55,.2)' }}>JJ</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: INK }}>JJ&apos;s Barbers</div>
            <div style={{ fontSize: 12, color: STONE, display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 7, height: 7, borderRadius: 99, background: '#3f9d6b', display: 'inline-block' }} /> Novi · Open till 7pm</div>
          </div>
          <div style={{ position: 'relative', width: 38, height: 38, borderRadius: 11, display: 'grid', placeItems: 'center', background: '#fff', border: '1px solid rgba(31,64,55,.12)', fontSize: 17 }}>
            <span>◔</span>
            <span style={{ position: 'absolute', top: -3, right: -3, minWidth: 16, height: 16, padding: '0 4px', borderRadius: 99, background: '#c2504f', color: '#fff', fontSize: 10, fontWeight: 700, display: 'grid', placeItems: 'center' }}>2</span>
          </div>
        </header>

        {/* Scroll body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 18px 96px' }}>
          <div style={{ margin: '6px 2px 16px' }}>
            <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-.02em', color: '#202722' }}>Good morning, Jordan</div>
            <div style={{ fontSize: 13, color: STONE, marginTop: 2 }}>Friday, July 24 · a busy Friday ahead</div>
          </div>

          {/* KPI grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 18 }}>
            {[
              { label: 'Revenue today', value: '$1,240', sub: '+18% vs Thu', accent: true },
              { label: 'In queue', value: '4', sub: '2 waiting · 1 in chair' },
              { label: 'Appointments', value: '11', sub: '3 still to arrive' },
              { label: 'Avg wait', value: '18m', sub: 'target under 25m' },
            ].map((k) => (
              <div key={k.label} style={{ background: k.accent ? `linear-gradient(155deg, ${PINE_SOFT}, ${PINE})` : '#fff', color: k.accent ? '#fffaf0' : INK, borderRadius: 16, padding: '14px 14px 12px', border: k.accent ? 'none' : '1px solid rgba(31,64,55,.10)', boxShadow: '0 6px 16px rgba(31,64,55,.05)' }}>
                <div style={{ fontSize: 11.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', opacity: k.accent ? 0.85 : 0.6 }}>{k.label}</div>
                <div style={{ fontSize: 27, fontWeight: 700, letterSpacing: '-.02em', marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>{k.value}</div>
                <div style={{ fontSize: 11.5, marginTop: 3, opacity: k.accent ? 0.8 : 0.55 }}>{k.sub}</div>
              </div>
            ))}
          </div>

          {/* Live queue */}
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', margin: '2px 2px 10px' }}>
            <h2 style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: '#3a4a42', margin: 0 }}>Live queue</h2>
            <span style={{ fontSize: 12.5, color: PINE, fontWeight: 600 }}>View all →</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
            {queue.map((q) => {
              const t = toneStyle(q.tone);
              return (
                <div key={q.name} style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#fff', borderRadius: 14, padding: '12px 14px', border: '1px solid rgba(31,64,55,.09)', boxShadow: '0 4px 12px rgba(31,64,55,.04)' }}>
                  <div style={{ width: 40, height: 40, borderRadius: 11, background: '#f1efe8', display: 'grid', placeItems: 'center', fontWeight: 700, color: PINE, fontSize: 14, flex: 'none' }}>{q.name.split(' ').map((p) => p[0]).join('')}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 650, fontSize: 14.5, color: INK }}>{q.name}</div>
                    <div style={{ fontSize: 12.5, color: STONE, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.service} · {q.staff}</div>
                  </div>
                  <div style={{ textAlign: 'right', flex: 'none' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 99, background: t.bg, color: t.fg, whiteSpace: 'nowrap' }}>{q.status}</span>
                    <div style={{ marginTop: 6 }}>
                      <div style={{ fontSize: 9.5, color: STONE, textTransform: 'uppercase', letterSpacing: '.06em' }}>{q.timeLabel}</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: INK, fontVariantNumeric: 'tabular-nums' }}>{q.time}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Needs attention */}
          <h2 style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: '#3a4a42', margin: '2px 2px 10px' }}>Needs attention</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {alerts.map((a) => {
              const t = toneStyle(a.tone);
              return (
                <div key={a.title} style={{ display: 'flex', gap: 12, background: '#fff', borderRadius: 14, padding: '12px 14px', border: '1px solid rgba(31,64,55,.09)' }}>
                  <div style={{ width: 34, height: 34, borderRadius: 10, background: t.bg, color: t.fg, display: 'grid', placeItems: 'center', fontSize: 16, flex: 'none' }}>{a.icon}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 650, fontSize: 14, color: INK }}>{a.title}</div>
                    <div style={{ fontSize: 12.5, color: STONE }}>{a.body}</div>
                  </div>
                  <span style={{ alignSelf: 'center', color: STONE, fontSize: 18 }}>›</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Bottom tab bar */}
        <nav style={{ position: 'absolute', bottom: 0, left: 0, right: 0, display: 'flex', justifyContent: 'space-around', padding: '10px 8px 22px', background: 'rgba(250,248,242,.92)', backdropFilter: 'blur(12px)', borderTop: '1px solid rgba(31,64,55,.1)' }}>
          {tabs.map((label) => {
            const active = label === tab;
            return (
              <button key={label} onClick={() => setTab(label)} style={{ border: 'none', background: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, cursor: 'pointer', padding: '2px 6px' }}>
                <span style={{ width: 22, height: 22, borderRadius: 7, display: 'grid', placeItems: 'center', background: active ? PINE : 'transparent', color: active ? '#fffaf0' : STONE, fontSize: 12, fontWeight: 800 }}>{label[0]}</span>
                <span style={{ fontSize: 10.5, fontWeight: active ? 700 : 500, color: active ? PINE : STONE }}>{label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
