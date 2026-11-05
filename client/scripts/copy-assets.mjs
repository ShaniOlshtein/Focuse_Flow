// Copies runtime wasm assets into public/ so they are served same-origin (no CDN at runtime).
import { cpSync, mkdirSync, readdirSync } from "node:fs";
const copy = (from, to, filter) => {
  mkdirSync(to, { recursive: true });
  for (const f of readdirSync(from)) if (filter(f)) cpSync(`${from}/${f}`, `${to}/${f}`);
};
copy("node_modules/@mediapipe/tasks-vision/wasm", "public/mediapipe/wasm", () => true);
copy("node_modules/onnxruntime-web/dist", "public/ort", (f) => /^ort-wasm-simd-threaded\.(wasm|mjs)$/.test(f));
console.log("assets copied");
