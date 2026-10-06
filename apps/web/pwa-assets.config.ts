import { defineConfig, minimal2023Preset } from "@vite-pwa/assets-generator/config";

// App icons from public/favicon.svg: `bun run icons` regenerates them.
// Phones crop maskable and Apple icons themselves, so those get a full dark background.
export default defineConfig({
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, resizeOptions: { background: "#1c1917" } },
    apple: { ...minimal2023Preset.apple, resizeOptions: { background: "#1c1917" } },
  },
  images: ["public/favicon.svg"],
});
