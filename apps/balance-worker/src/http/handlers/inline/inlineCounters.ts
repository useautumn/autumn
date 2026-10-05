/** What the inline routes answered this window, and what they left to the ordinary routes and why. */
export type InlineCounters = {
	answered(params: { name: InlineCounterName; count?: number }): void;
	fellBack(params: { name: InlineRouteName; reason: string }): void;
	drain(): InlineCountersWindow;
};

type InlineRouteName = "track" | "trackBatch" | "check";
type InlineCounterName = InlineRouteName | "trackBatchItems";

type InlineCountersWindow = {
	answered: Partial<Record<InlineCounterName, number>>;
	/** Keyed `route.reason`; the inline share is answered ÷ (answered + fallbacks). */
	fallbacks: Record<string, number>;
};

export function createInlineCounters(): InlineCounters {
	let window: InlineCountersWindow = { answered: {}, fallbacks: {} };
	function answered({
		name,
		count = 1,
	}: {
		name: InlineCounterName;
		count?: number;
	}): void {
		window.answered[name] = (window.answered[name] ?? 0) + count;
	}
	function fellBack({
		name,
		reason,
	}: {
		name: InlineRouteName;
		reason: string;
	}): void {
		const key = `${name}.${reason}`;
		window.fallbacks[key] = (window.fallbacks[key] ?? 0) + 1;
	}
	function drain(): InlineCountersWindow {
		const drained = window;
		window = { answered: {}, fallbacks: {} };
		return drained;
	}
	return { answered, fellBack, drain };
}
