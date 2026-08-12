export type MotionSample = {
	x: number;
	y: number;
	z: number;
	timestamp: number;
};

export const isMobilePhone = (userAgent: string) =>
	/iPhone|iPod/i.test(userAgent) || /Android.+Mobile/i.test(userAgent);

export const createShakeDetector = ({
	onShake,
	threshold = 18,
	requiredPeaks = 2,
	peakWindowMs = 600,
	cooldownMs = 1_500,
}: {
	onShake: () => void;
	threshold?: number;
	requiredPeaks?: number;
	peakWindowMs?: number;
	cooldownMs?: number;
}) => {
	let previousSample: MotionSample | null = null;
	let peakCount = 0;
	let lastPeakAt = Number.NEGATIVE_INFINITY;
	let lastShakeAt = Number.NEGATIVE_INFINITY;

	return (sample: MotionSample) => {
		if (!previousSample) {
			previousSample = sample;
			return;
		}

		const delta = Math.hypot(
			sample.x - previousSample.x,
			sample.y - previousSample.y,
			sample.z - previousSample.z,
		);
		previousSample = sample;

		if (delta < threshold) return;

		if (sample.timestamp - lastPeakAt > peakWindowMs) {
			peakCount = 0;
		}

		peakCount += 1;
		lastPeakAt = sample.timestamp;

		if (
			peakCount < requiredPeaks ||
			sample.timestamp - lastShakeAt < cooldownMs
		) {
			return;
		}

		peakCount = 0;
		lastShakeAt = sample.timestamp;
		onShake();
	};
};
