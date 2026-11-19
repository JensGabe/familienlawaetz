// Generates the favicon and app icons from the coat of arms. Run after changing vaaben.svg:  npm run icons
// The results are committed (src/static/ is copied to the site root), so builds don't need to run this.
// sharp comes with @11ty/eleventy-img.
const fs = require("node:fs");
const sharp = require("sharp");

const SVG = "src/static/images/vaaben.svg";
const PAPER = "#faf8f4"; // --paper in theme.css

// The arms (taller than wide) centred on a square paper background; `pad` is the margin above and below.
async function icon(size, pad) {
  const arms = await sharp(SVG, { density: 600 })
    .resize({ height: Math.round(size * (1 - 2 * pad)) })
    .png()
    .toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: PAPER } })
    .composite([{ input: arms, gravity: "center" }])
    .png()
    .toBuffer();
}

// An .ico file holding one PNG image (supported by every browser that still asks for /favicon.ico).
function ico(png, size) {
  const header = Buffer.alloc(22);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // one image
  header.writeUInt8(size, 6); // width
  header.writeUInt8(size, 7); // height
  header.writeUInt16LE(1, 10); // colour planes
  header.writeUInt16LE(32, 12); // bits per pixel
  header.writeUInt32LE(png.length, 14); // image size
  header.writeUInt32LE(22, 18); // image offset
  return Buffer.concat([header, png]);
}

(async () => {
  const out = {
    "src/static/favicon.ico": ico(await icon(32, 0.04), 32),
    "src/static/apple-touch-icon.png": await icon(180, 0.1),
    "src/static/images/icon-192.png": await icon(192, 0.08),
    "src/static/images/icon-512.png": await icon(512, 0.08),
    // Android may crop to a circle: keep the arms inside the central 80 %.
    "src/static/images/icon-maskable-512.png": await icon(512, 0.2),
  };
  for (const [file, data] of Object.entries(out)) {
    fs.writeFileSync(file, data);
    console.log(file, data.length, "bytes");
  }
})();
