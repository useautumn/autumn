import { expect } from "bun:test";

export const expectUsageLimitWindowContains = ({
	usageLimit,
	at,
	intervalMs,
}: {
	usageLimit: { window_start_at: number; window_end_at: number } | undefined;
	at: number;
	intervalMs: number;
}) => {
	expect(usageLimit).toBeDefined();
	const { window_start_at: windowStartAt, window_end_at: windowEndAt } =
		usageLimit!;
	expect(windowEndAt - windowStartAt).toBe(intervalMs);
	expect(windowStartAt).toBeLessThanOrEqual(at);
	expect(windowEndAt).toBeGreaterThan(at);
};
