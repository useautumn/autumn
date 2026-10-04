export type Variant = "A" | "B" | "C" | "D";

let override: ((experiment: string) => Variant) | null = null;

/** Stand-in for `@autumn/edge-config`'s staging `variant()` until autumn#4108 lands: always the control. */
export function variant(experiment: string): Variant {
	return override?.(experiment) ?? "A";
}

/** Tests and benches pick an arm; null restores the control. */
export function overrideVariant(
	pick: ((experiment: string) => Variant) | null,
): void {
	override = pick;
}
