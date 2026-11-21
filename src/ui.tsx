import type { ReactNode } from 'react';
import { HStack } from '@astryxdesign/core/HStack';
import { VStack } from '@astryxdesign/core/VStack';
import { Card } from '@astryxdesign/core/Card';
import { Button } from '@astryxdesign/core/Button';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
export { HStack, VStack, Card, Button };

const paths = {
  run: 'm14 5 2-2m-4 5 4 2 3-1m-7-1-3 5 4 3 1 5m-5-8-3 4H3m8-9-3 1-2 3',
  chart: 'M4 4v16h16M8 14l4-5 4 2 4-6',
  spark: 'm12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4L12 3z',
  link: 'm9 15 6-6M8 16l-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 1 1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0',
  chevron: 'm9 6 6 6-6 6',
  close: 'm6 6 12 12M6 18 18 6',
  menu: 'M4 6h16M4 12h16M4 18h16',
  check: 'm5 12 4 4L19 6',
  clock: 'M12 8v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  mountain: 'm2 20 7-14 4 8 3-5 6 11H2m4-8 3 2 2-2',
  heart: 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8',
  pin: 'M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0zM14 10a2 2 0 1 1-4 0 2 2 0 0 1 4 0',
  flag: 'M5 21V3m0 0c5-4 9 4 15 0v10c-6 4-10-4-15 0',
  leaf: 'M20 3c-9-1-16 4-15 11 0 4 4 6 8 4 5-2 7-7 7-15ZM4 21 15 10',
  strength: 'M6 6v12M3 8v8m15-10v12m3-10v8M6 12h12',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zm13 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  refresh: 'M20 7v5h-5M4 17v-5h5M6 6a8 8 0 0 1 13 3M18 18a8 8 0 0 1-13-3',
  shield: 'm12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3zm-4 9 3 3 5-6',
  settings: 'M4 7h16M4 17h16M9 4v6m6 4v6',
  info: 'M12 11v6m0-10v.1M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  sun: 'M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1m-3 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  moon: 'M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11z',
  monitor: 'M3 4h18v13H3V4zm9 13v4m-4 0h8',
  calendar: 'M4 5h16v16H4V5zm3-3v6m10-6v6M4 10h16',
  logout: 'M9 4H4v16h5m5-13 5 5-5 5m-5-5h14',
};
export function Icon({ name, size = 20 }: { name: keyof typeof paths; size?: number }) {
  return <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
export function Brand() {
  return <a href="#main" className="brand" aria-label="Milemark home"><svg viewBox="0 0 32 32" width="31" height="31" aria-hidden="true"><rect width="32" height="32" rx="10" fill="currentColor" /><path d="M8 23V10h4l4 6 4-6h4v13h-4v-7l-4 6-4-6v7z" fill="var(--color-on-accent)" /></svg><strong>milemark<em>.</em></strong></a>;
}
export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) { return <Card padding={0} className={`panel ${className}`}>{children}</Card>; }
export function SectionHeading({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: ReactNode }) {
  return <header className="section-heading"><VStack gap={1}>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h2>{title}</h2></VStack>{children}</header>;
}
export function Note({ children, warning = false }: { children: ReactNode; warning?: boolean }) { return <p className={`note ${warning ? 'warning' : ''}`}><Icon name={warning ? 'shield' : 'info'} size={17} /><strong className="note-content">{children}</strong></p>; }
export function Modal({ title, subtitle, open, onClose, children }: { title: string; subtitle?: string; open: boolean; onClose: () => void; children: ReactNode }) {
  return <Dialog isOpen={open} onOpenChange={isOpen => !isOpen && onClose()} width="min(36rem, calc(100vw - 2rem))" padding={0}><DialogHeader title={title} subtitle={subtitle} onOpenChange={isOpen => !isOpen && onClose()} /><VStack className="modal-body" gap={4}>{children}</VStack></Dialog>;
}
export function TrackArt({ className = '' }: { className?: string }) {
  return <svg className={`track-art ${className}`} viewBox="0 0 400 250" fill="none" aria-hidden="true">{[0, 1, 2, 3, 4, 5].map(i => <rect key={i} x={80 + i * 10} y={-30 + i * 10} width={240 - i * 20} height={310 - i * 20} rx={120 - i * 10} transform="rotate(35 200 125)" stroke="currentColor" strokeWidth="1.2" />)}<path d="m245 210 42-60" stroke="currentColor" strokeWidth="2" /></svg>;
}
