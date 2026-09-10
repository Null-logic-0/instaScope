import { build } from "esbuild";
import { cp, mkdir } from "node:fs/promises";

await mkdir("dist", { recursive: true });
await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  format: "iife",
  globalName: "instaScope",
  target: "es2022",
  charset: "utf8",
  outfile: "dist/instascope.js",
  banner: { js: "/* instaScope 0.1.0 | MIT License */" },
});
await cp("workbench", "dist", { recursive: true });
console.log("built dist/instascope.js and copied workbench/ into dist/");
