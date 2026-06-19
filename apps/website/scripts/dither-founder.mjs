import sharp from "sharp";

const [, , inPath, outPath, maxWArg] = process.argv;
if (!inPath || !outPath) {
	console.error("usage: dither-founder.mjs <in> <out> [maxWidth]");
	process.exit(1);
}
const maxW = Number(maxWArg) || 360;

const img = sharp(inPath).resize({ width: maxW, withoutEnlargement: true });
const { data, info } = await img
	.ensureAlpha()
	.raw()
	.toBuffer({ resolveWithObject: true });

const { width, height, channels } = info;

// Tunables: bias darkens the source so only highlights become white dots;
// contrast spreads midtones so the dither reads as facial structure.
const BIAS = Number(process.env.DITHER_BIAS ?? -70);
const CONTRAST = Number(process.env.DITHER_CONTRAST ?? 1.35);

// Greyscale luminance buffer, carrying alpha through.
const lum = new Float32Array(width * height);
const alpha = new Uint8Array(width * height);
for (let i = 0; i < width * height; i++) {
	const r = data[i * channels];
	const g = data[i * channels + 1];
	const b = data[i * channels + 2];
	const a = channels === 4 ? data[i * channels + 3] : 255;
	let l = 0.299 * r + 0.587 * g + 0.114 * b;
	l = (l - 128) * CONTRAST + 128 + BIAS;
	lum[i] = Math.max(0, Math.min(255, l));
	alpha[i] = a;
}

// Floyd–Steinberg dither to 1-bit.
const out = Buffer.alloc(width * height * 4, 0);
for (let y = 0; y < height; y++) {
	for (let x = 0; x < width; x++) {
		const i = y * width + x;
		const old = lum[i];
		const newVal = old < 128 ? 0 : 255;
		const err = old - newVal;
		// Distribute error.
		if (x + 1 < width) lum[i + 1] += (err * 7) / 16;
		if (y + 1 < height) {
			if (x > 0) lum[i + width - 1] += (err * 3) / 16;
			lum[i + width] += (err * 5) / 16;
			if (x + 1 < width) lum[i + width + 1] += (err * 1) / 16;
		}
		// White pixel where light AND inside the subject (alpha), else transparent.
		const on = newVal === 255 && alpha[i] > 40;
		const o = i * 4;
		out[o] = 255;
		out[o + 1] = 255;
		out[o + 2] = 255;
		out[o + 3] = on ? 255 : 0;
	}
}

await sharp(out, { raw: { width, height, channels: 4 } })
	.png()
	.toFile(outPath);

console.log(`wrote ${outPath} (${width}x${height})`);
