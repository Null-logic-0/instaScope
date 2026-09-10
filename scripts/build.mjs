import { build } from "esbuild";
import { copyFile, mkdir } from "node:fs/promises";

await mkdir("dist", { recursive: true });
await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  format: "iife",
  globalName: "instaScope",
  target: "es2022",
  charset: "utf8",
  outfile: "dist/instascope.js",
  banner: { js: "/* instaScope 0.1.0 | GPL-3.0 */" },
});
await copyFile("workbench/index.html", "dist/index.html");
console.log("built dist/instascope.js and dist/index.html");
