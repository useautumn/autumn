const MAX_PER_MINUTE = 10;
const WINDOW_MS = 60_000;

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export const shouldEmitSlowLog = ({
	operation,
}: {
	operation: string;
}): boolean => {
	const now = Date.now();
	const bucket = buckets.get(operation);
	if (!bucket || bucket.resetAt < now) {
		buckets.set(operation, { count: 1, resetAt: now + WINDOW_MS });
		return true;
	}
	if (bucket.count >= MAX_PER_MINUTE) return false;
	bucket.count++;
	return true;
};
