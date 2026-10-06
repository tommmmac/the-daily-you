/**
 * Serves the built web app (apps/web/dist, from `bun run build`), so one server on one
 * address is the whole app. In dev, Vite serves it instead and this stays out of the way.
 */
import { join, normalize, resolve } from "node:path";

const dist = resolve(import.meta.dir, "../../web/dist");

/** True if there's a build to serve. */
export const hasWebBuild = () => Bun.file(join(dist, "index.html")).exists();

/** The file at `pathname`, or the app's index.html for any other page. null if there's no build. */
export async function serveWeb(pathname: string): Promise<Response | null> {
  let path = "";
  try {
    path = normalize(decodeURIComponent(pathname)).replace(/^[/\\]+/, "");
  } catch {
    // A broken %-escape: just serve the app.
  }
  const file = Bun.file(join(dist, path));
  // normalize() strips "..", but check anyway that we're still inside dist.
  if (path && join(dist, path).startsWith(dist) && (await file.exists())) {
    return new Response(file, { headers: { "Cache-Control": cacheFor(path) } });
  }
  // Anything else is a page of the app (/chat, /journal/2026-10-03), which React Router handles.
  const index = Bun.file(join(dist, "index.html"));
  if (!(await index.exists())) return null;
  return new Response(index, { headers: { "Cache-Control": "no-cache", "Content-Type": "text/html; charset=utf-8" } });
}

// Vite puts a hash in every file name under assets/, so those never change. Everything
// else (index.html, the service worker, the manifest) has to be checked each time.
const cacheFor = (path: string) => (path.startsWith("assets") ? "public, max-age=31536000, immutable" : "no-cache");
