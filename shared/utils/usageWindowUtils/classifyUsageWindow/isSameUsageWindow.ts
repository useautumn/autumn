/** Stripe stamps a subscription's anchor seconds after we stamp its product's start, so one cycle's recomputed bounds can drift by that much. */
export const USAGE_WINDOW_BOUND_TOLERANCE_MS = 30_000;

type UsageWindowBounds = { window_start_at: number; window_end_at: number };

/** Whether a counter row still counts in a window: its bounds match, but for that recomputation drift. */
export const isSameUsageWindow = ({
	usageWindow,
	window,
}: {
	usageWindow: UsageWindowBounds;
	window: UsageWindowBounds;
}): boolean =>
	Math.abs(Number(usageWindow.window_start_at) - window.window_start_at) <=
		USAGE_WINDOW_BOUND_TOLERANCE_MS &&
	Math.abs(Number(usageWindow.window_end_at) - window.window_end_at) <=
		USAGE_WINDOW_BOUND_TOLERANCE_MS;
