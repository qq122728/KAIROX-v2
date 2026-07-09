"use client";

/** Maps server event type → Chinese voice prompt text (for speechSynthesis fallback). */
export const NOTIFICATION_VOICE: Record<string, string> = {
  "user:registered": "有新的用户注册",
  "deposit:created": "有新的充值申请",
  "withdrawal:created": "有新的提现申请",
  "kyc:created": "有新的身份审核",
  "binary:created": "有新的交易订单",
  "trade:created": "有新的交易订单",
  support_message: "有新的客服消息",
  fiat_deposit: "有新的法币入金申请",
  "fiat_deposit:requested": "有新的法币入金申请",
  "fiat_deposit:submitted": "用户已提交法币转账信息",
  "support_message:created": "有新的客服消息",
  default: "有新的系统通知",
};

/** Maps server event type → mp3 filename (without extension). */
const AUDIO_FILE_MAP: Record<string, string> = {
  "user:registered": "register",
  "deposit:created": "deposit",
  "withdrawal:created": "withdrawal",
  "kyc:created": "kyc",
  "binary:created": "trade-order",
  "trade:created": "trade-order",
  support_message: "support-message",
  fiat_deposit: "fiat-deposit",
  "fiat_deposit:requested": "fiat-deposit",
  "fiat_deposit:submitted": "fiat-deposit",
  "support_message:created": "support-message",
};

const STORAGE_KEY = "admin_notification_sound_enabled";

let globalSoundEnabled = true;

function readSoundSetting(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return true;
    return raw === "true";
  } catch {
    return true;
  }
}

export function isSoundEnabled(): boolean {
  return globalSoundEnabled;
}

export function getSoundEnabled(): boolean {
  return readSoundSetting();
}

export function setSoundEnabled(value: boolean): void {
  globalSoundEnabled = value;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, value ? "true" : "false");
    } catch {
      /* quota exceeded — ignore */
    }
  }
}

export function getVoiceText(eventType: string): string {
  return NOTIFICATION_VOICE[eventType] || NOTIFICATION_VOICE.default;
}

/** Try to play an mp3 file. Returns true if it played. */
async function tryPlayMp3(eventType: string): Promise<boolean> {
  const key = AUDIO_FILE_MAP[eventType];
  if (!key) return false;
  const url = `/sounds/admin/${key}.mp3`;

  return new Promise((resolve) => {
    try {
      const audio = new Audio(url);
      audio.volume = 0.8;
      let played = false;
      const done = (success: boolean) => {
        if (played) return;
        played = true;
        audio.removeEventListener("ended", finish);
        audio.removeEventListener("error", fail);
        resolve(success);
      };
      const finish = () => done(true);
      const fail = () => done(false);
      audio.addEventListener("ended", finish);
      audio.addEventListener("error", fail);
      audio.play().then(() => {
        /* started playing — success will come from 'ended' */
      }).catch(() => {
        /* autoplay blocked — fall through to speechSynthesis */
        fail();
      });
      /* Safety timeout: if 'ended' never fires, don't hang. */
      setTimeout(() => done(false), 2000);
    } catch {
      resolve(false);
    }
  });
}

/** Fallback: speak the Chinese prompt via speechSynthesis. */
function speakChinese(text: string): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    console.warn("[notify] speechSynthesis unavailable — cannot speak:", text);
    return;
  }
  try {
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = "zh-CN";
    utter.rate = 1.05;
    utter.volume = 0.8;
    utter.onstart = () => { console.log("[notify] TTS started:", text); };
    utter.onend = () => { console.log("[notify] TTS finished:", text); };
    utter.onerror = (event) => {
      console.warn("[notify] TTS error:", event.error, "— text:", text);
      if (event.error === "not-allowed") {
        console.warn("[notify] ⚠️ Notification voice blocked by browser until user interaction. Click anywhere on the page to enable voice.");
      }
    };
    /* Cancel any in-progress speech to avoid overlapping. */
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utter);
  } catch (error) {
    console.warn("[notify] speechSynthesis speak failed:", error);
  }
}

/** Throttle: only allow one sound within cooldownMs. */
let lastSoundTime = 0;
const SOUND_COOLDOWN = 3000;

/**
 * Play the typed notification audio.
 * 1. Checks soundEnabled (localStorage)
 * 2. Tries mp3 file first
 * 3. Falls back to speechSynthesis
 */
export async function playTypedNotification(eventType: string): Promise<void> {
  if (!readSoundSetting()) return;
  const now = Date.now();
  if (now - lastSoundTime < SOUND_COOLDOWN) return;
  lastSoundTime = now;

  const mp3Success = await tryPlayMp3(eventType);
  if (mp3Success) return;

  /* Fallback to speechSynthesis */
  const text = getVoiceText(eventType);
  speakChinese(text);
}

/**
 * Unlock audio (required for browser autoplay policy).
 * Call this on first user click.
 */
let speechSynthesisPrimed = false;

export function unlockAudio(): boolean {
  if (typeof window === "undefined") return false;
  try {
    /* Create a silent AudioContext to unlock Web Audio */
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume();
    /* Also prime the HTML Audio element by creating a short silent buffer */
    const audio = new Audio();
    audio.volume = 0;
    const src = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";
    audio.play().catch(() => {});
    /* Prime speechSynthesis so TTS is allowed outside user gesture */
    if (!speechSynthesisPrimed && "speechSynthesis" in window) {
      try {
        const u = new SpeechSynthesisUtterance("");
        u.volume = 0;
        u.lang = "zh-CN";
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(u);
        speechSynthesisPrimed = true;
      } catch {
        /* speechSynthesis unavailable — notifications will use console fallback */
      }
    }
    return true;
  } catch {
    return false;
  }
}
