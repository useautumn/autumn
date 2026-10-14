export interface ExplodeOptions {
	width: number;
	height: number;
	maxFrames?: number;
}

const EXPLOSION_CHARS = ["*", ".", "@", "#", "&", "+", "%"];

export function getExplodeFrame(
	width: number,
	height: number,
	frame: number,
	maxFrames: number,
): string {
	const lines: string[] = [];

	const centerX = Math.floor(width / 2);
	const centerY = Math.floor(height / 2);

	const maxRadius = Math.hypot(centerX, centerY);

	const progress = Math.sqrt(frame / maxFrames);

	const radius = progress * maxRadius * 2;

	const innerRadius = progress > 0.5 ? (progress - 0.5) * 2 * maxRadius : 0;

	const threshold = progress ** 4;

	for (let y = 0; y < height; y++) {
		let line = "";
		for (let x = 0; x < width; x++) {
			const distance = Math.hypot(x - centerX, (y - centerY) * 2);

			if (distance <= radius && distance >= innerRadius) {
				const fadeMultiplier = progress > 0.85 ? 1 + (progress - 0.85) * 10 : 1;
				const effectiveThreshold = Math.min(threshold * fadeMultiplier, 1.0);

				if (Math.random() > effectiveThreshold) {
					const char =
						EXPLOSION_CHARS[Math.floor(Math.random() * EXPLOSION_CHARS.length)];
					line += char;
				} else {
					line += " ";
				}
			} else {
				line += " ";
			}
		}
		lines.push(line);
	}

	return lines.join("\n");
}

export function getExplosionColor(frame: number, maxFrames: number): string {
	const colors = ["white", "yellow", "red", "blue", "blackBright"];
	const index = Math.floor((frame * colors.length) / maxFrames) % colors.length;
	return colors[index] as string;
}

export function* generateExplosionFrames(options: ExplodeOptions) {
	const { width, height, maxFrames = 25 } = options;

	for (let frame = 0; frame < maxFrames; frame++) {
		const image = getExplodeFrame(width, height, frame, maxFrames);
		const color = getExplosionColor(frame, maxFrames);
		yield { image, color, frame, progress: frame / maxFrames };
	}
}
