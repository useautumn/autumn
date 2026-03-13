/**
 * Explosion animation utility
 * Reverse-engineered from LazyGit's nuke animation
 */

export interface ExplodeOptions {
	width: number;
	height: number;
	maxFrames?: number;
}

const EXPLOSION_CHARS = ["*", ".", "@", "#", "&", "+", "%"];

/**
 * Generate an explosion frame
 * @param width - Width of the explosion area
 * @param height - Height of the explosion area
 * @param frame - Current frame number (0 to max)
 * @param maxFrames - Total number of frames
 * @returns String representing the explosion frame
 */
export function getExplodeFrame(
	width: number,
	height: number,
	frame: number,
	maxFrames: number,
): string {
	const lines: string[] = [];

	// Calculate the center of explosion
	const centerX = Math.floor(width / 2);
	const centerY = Math.floor(height / 2);

	// Calculate the max radius (hypotenuse of the view)
	const maxRadius = Math.hypot(centerX, centerY);

	// Calculate frame as a proportion of max, apply square root for non-linear effect
	const progress = Math.sqrt(frame / maxFrames);

	// Calculate radius of explosion according to frame
	const radius = progress * maxRadius * 2;

	// Calculate inner radius for shockwave effect
	const innerRadius = progress > 0.5 ? (progress - 0.5) * 2 * maxRadius : 0;

	// Make probability threshold more aggressive near the end to ensure all chars disappear
	// Use exponential curve: progress^4 makes it much harder for chars to appear as we approach 1.0
	// At 90% progress, threshold = 0.656, at 95% = 0.814, at 99% = 0.961
	const threshold = progress ** 4;

	for (let y = 0; y < height; y++) {
		let line = "";
		for (let x = 0; x < width; x++) {
			// Calculate distance from center, scale y by 2 to compensate for character aspect ratio
			const distance = Math.hypot(x - centerX, (y - centerY) * 2);

			// If distance is within explosion ring, draw explosion char
			if (distance <= radius && distance >= innerRadius) {
				// Make placement random and less likely as explosion progresses
				// Add extra multiplier for final 15% to guarantee fadeout
				const fadeMultiplier = progress > 0.85 ? 1 + (progress - 0.85) * 10 : 1;
				const effectiveThreshold = Math.min(threshold * fadeMultiplier, 1.0);

				if (Math.random() > effectiveThreshold) {
					// Pick a random explosion char
					const char =
						EXPLOSION_CHARS[Math.floor(Math.random() * EXPLOSION_CHARS.length)];
					line += char;
				} else {
					line += " ";
				}
			} else {
				// Empty space
				line += " ";
			}
		}
		lines.push(line);
	}

	return lines.join("\n");
}

/**
 * Get color for current frame (cycles through colors as animation progresses)
 */
export function getExplosionColor(frame: number, maxFrames: number): string {
	const colors = ["white", "yellow", "red", "blue", "blackBright"];
	const index = Math.floor((frame * colors.length) / maxFrames) % colors.length;
	return colors[index] as string;
}

/**
 * Generate all frames for the explosion animation
 */
export function* generateExplosionFrames(options: ExplodeOptions) {
	const { width, height, maxFrames = 25 } = options;

	for (let frame = 0; frame < maxFrames; frame++) {
		const image = getExplodeFrame(width, height, frame, maxFrames);
		const color = getExplosionColor(frame, maxFrames);
		yield { image, color, frame, progress: frame / maxFrames };
	}
}
