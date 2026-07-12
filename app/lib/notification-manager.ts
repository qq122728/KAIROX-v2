"use client";

export type ClientNotification = { id: number; type: string; title: string; body: string; entityType?: string | null; entityId?: string | null; readAt?: string | null; createdAt: string };

type Listener = (notification: ClientNotification) => void;
const listeners = new Set<Listener>();
const seen = new Set<number>();
let audio: AudioContext | null = null;
let enabled = false;

function getAudio() {
  if (audio) return audio;
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  audio = new Ctor();
  return audio;
}

export const notificationManager = {
  subscribe(listener: Listener) { listeners.add(listener); return () => listeners.delete(listener); },
  async enable() {
    enabled = true;
    const ctx = getAudio();
    if (ctx?.state === "suspended") await ctx.resume().catch(() => {});
    if (typeof Notification !== "undefined" && Notification.permission === "default") await Notification.requestPermission().catch(() => {});
  },
  receive(notification: ClientNotification) {
    if (seen.has(notification.id)) return;
    seen.add(notification.id);
    if (seen.size > 500) seen.clear();
    for (const listener of listeners) listener(notification);
    if (enabled) {
      try {
        const ctx = getAudio();
        if (ctx) { const osc = ctx.createOscillator(); const gain = ctx.createGain(); osc.frequency.value = 880; gain.gain.value = 0.05; osc.connect(gain).connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + 0.15); }
      } catch {}
    }
    if (typeof document !== "undefined" && document.hidden && typeof Notification !== "undefined" && Notification.permission === "granted") {
      const n = new Notification(notification.title, { body: notification.body });
      n.onclick = () => { window.focus(); n.close(); };
    }
  },
};
