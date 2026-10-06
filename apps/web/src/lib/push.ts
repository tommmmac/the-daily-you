// Turning the nightly reminder on or off for this device. Needs the service worker, so it
// works in the built app (`bun run start`), not under `bun run dev`.
import { api } from "@/lib/api";

export type PushState = "unsupported" | "no-worker" | "blocked" | "off" | "on";

export const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

async function registration() {
  return (await navigator.serviceWorker?.getRegistration()) ?? null;
}

export async function pushState(): Promise<PushState> {
  if (!pushSupported()) return "unsupported";
  const reg = await registration();
  if (!reg) return "no-worker";
  if (Notification.permission === "denied") return "blocked";
  return (await reg.pushManager.getSubscription()) ? "on" : "off";
}

/** The server's key as bytes, which every browser accepts. */
const keyBytes = (base64url: string) =>
  Uint8Array.from(atob(base64url.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

export async function enablePush() {
  const reg = await registration();
  if (!reg) throw new Error("Reminders need the app itself (bun run start), not the dev server.");
  if ((await Notification.requestPermission()) !== "granted") {
    throw new Error("Notifications are blocked for this site. Allow them in the browser's site settings, then try again.");
  }
  const { publicKey } = await api.pushKey();
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
  await api.pushSubscribe(sub.toJSON());
}

export async function disablePush() {
  const sub = await (await registration())?.pushManager.getSubscription();
  if (!sub) return;
  await api.pushUnsubscribe(sub.endpoint).catch(() => {});
  await sub.unsubscribe();
}

export async function testPush() {
  const sub = await (await registration())?.pushManager.getSubscription();
  if (!sub) throw new Error("Reminders aren't on for this device.");
  await api.pushTest(sub.endpoint);
}
