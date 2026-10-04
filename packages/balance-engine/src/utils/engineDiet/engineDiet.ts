/**
 * Spike switches for the lean track paths, as bits of ENGINE_DIET (default 0 = the baseline paths):
 *  1 row changes without per-row object churn   2 the integer draw's outcome in plain numbers
 *  4 usage-event fields in plain numbers          8 the request built once per track
 * 16 the carried context advanced without filter, map and closure churn
 * Each lean path is proven against its baseline in tests/unit/deduction/engine-diet-equivalence.test.ts.
 */
const bits = Number(
	(globalThis as { process?: { env?: Record<string, string | undefined> } })
		.process?.env?.ENGINE_DIET ?? 0,
);

export const engineDiet = {
	rowChanges: (bits & 1) !== 0,
	integerOutcome: (bits & 2) !== 0,
	usageEventFields: (bits & 4) !== 0,
	requestOnce: (bits & 8) !== 0,
	advanceContext: (bits & 16) !== 0,
};
