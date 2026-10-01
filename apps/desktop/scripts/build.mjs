import { build } from "esbuild";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const production = process.env.NODE_ENV !== "development";

const PAGES = {
  control: "Screenly",
  setup: "New recording",
  settings: "Screenly Settings",
  onboarding: "Welcome to Screenly",
  hud: "Screenly recording controls",
  webcam: "Screenly camera",
  region: "Select an area to record",
  capture: "Screenly capture",
};

const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "media-src 'self' blob: mediastream:",
].join("; ");

await rm(dist, { recursive: true, force: true });
await mkdir(path.join(dist, "renderer"), { recursive: true });

const shared = {
  bundle: true,
  sourcemap: production ? false : "inline",
  minify: production,
  logLevel: "warning",
  define: {
    "process.env.NODE_ENV": JSON.stringify(production ? "production" : "development"),
  },
};

await Promise.all([
  build({
    ...shared,
    entryPoints: [path.join(root, "src/main/main.ts")],
    outfile: path.join(dist, "main.js"),
    platform: "node",
    format: "cjs",
    target: "node22",
    external: ["electron"],
  }),
  build({
    ...shared,
    entryPoints: [path.join(root, "src/preload/preload.ts")],
    outfile: path.join(dist, "preload.js"),
    platform: "node",
    format: "cjs",
    target: "chrome130",
    external: ["electron"],
  }),
  build({
    ...shared,
    entryPoints: Object.keys(PAGES).map((page) => {
      const extension = page === "capture" ? "ts" : "tsx";
      return {
        in: path.join(root, `src/renderer/pages/${page}.${extension}`),
        out: page,
      };
    }),
    outdir: path.join(dist, "renderer"),
    platform: "browser",
    format: "iife",
    target: "chrome130",
    jsx: "automatic",
  }),
]);

await copyFile(
  path.join(root, "src/renderer/styles.css"),
  path.join(dist, "renderer/styles.css"),
);

for (const [page, title] of Object.entries(PAGES)) {
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="Content-Security-Policy" content="${CONTENT_SECURITY_POLICY}" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body class="page-${page}">
    <div id="root"></div>
    <script src="${page}.js"></script>
  </body>
</html>
`;
  await writeFile(path.join(dist, "renderer", `${page}.html`), html);
}

async function renderIcon(source, output, size) {
  await mkdir(path.dirname(output), { recursive: true });
  const svg = await readFile(path.join(root, "assets", source));
  const { width = size } = await sharp(svg).metadata();
  await sharp(svg, { density: Math.max(72, (72 * size) / width) })
    .resize(size, size)
    .png()
    .toFile(output);
}

const assets = path.join(dist, "assets");
await Promise.all([
  renderIcon("icon.svg", path.join(assets, "icon.png"), 512),
  renderIcon("tray.svg", path.join(assets, "tray.png"), 16),
  renderIcon("tray.svg", path.join(assets, "tray@2x.png"), 32),
  renderIcon("tray.svg", path.join(assets, "tray-linux.png"), 48),
  renderIcon("tray-recording.svg", path.join(assets, "tray-recording.png"), 16),
  renderIcon("tray-recording.svg", path.join(assets, "tray-recording@2x.png"), 32),
  renderIcon("tray-recording.svg", path.join(assets, "tray-recording-linux.png"), 48),
  renderIcon("icon.svg", path.join(root, "build", "icon.png"), 1024),
  ...[16, 32, 48, 64, 128, 256, 512].map((size) =>
    renderIcon("icon.svg", path.join(root, "build", "icons", `${size}x${size}.png`), size),
  ),
]);

console.log(`Built Screenly desktop (${production ? "production" : "development"}) into ${dist}`);
