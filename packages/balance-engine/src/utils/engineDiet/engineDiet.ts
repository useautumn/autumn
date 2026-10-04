/**
 * Which lean track paths run. The engine keeps every baseline path and asks this binding per use, so a
 * runtime experiment can switch a window to the lean paths and back; unbound (prod, dev, tests) it is the
 * baseline. Each lean path is proven byte-equal to its baseline in tests/unit/deduction/engineDietEquivalence.test.ts.
 */
export type EngineDietFlags = Readonly<{
	/** Row changes built without the per-row filter, map, Set and entries churn. */
	rowChanges: boolean;
	/** The deduction request built once per track and handed to the decision. */
	requestOnce: boolean;
	/** The carried context advanced without filter arrays, maps and closures. */
	advanceContext: boolean;
}>;

export const BASELINE_ENGINE_DIET: EngineDietFlags = Object.freeze({
	rowChanges: false,
	requestOnce: false,
	advanceContext: false,
});

let read: () => EngineDietFlags = () => BASELINE_ENGINE_DIET;

/** Called once at boot by the process that owns the experiment; `read` runs on every decide, so keep it cheap. */
export function bindEngineDiet({
	read: next,
}: {
	read: () => EngineDietFlags;
}): void {
	read = next;
}

export function engineDiet(): EngineDietFlags {
	return read();
}
