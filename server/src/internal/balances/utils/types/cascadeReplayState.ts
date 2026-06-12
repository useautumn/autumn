import type { FeatureDeduction } from "./featureDeduction.js";

/**
 * State attached to an error when a cascade was partially applied and its
 * compensation failed: the included deduction's mutations persisted, so a
 * queued replay must charge only the unapplied overage portion instead of
 * re-running the whole cascade, which would double-charge the included
 * credit system.
 */
export type CascadeReplayState = {
	includedApplied: boolean;
	/** Leftover event fraction the overage deduction still has to cover. */
	spillRemaining: number;
};

const cascadeReplayStateKey = Symbol.for("autumn.track.cascadeReplayState");

type ErrorWithCascadeReplayState = Error & {
	[cascadeReplayStateKey]?: CascadeReplayState | null;
};

export const attachCascadeReplayState = ({
	error,
	state,
}: {
	error: unknown;
	state: CascadeReplayState | null | undefined;
}): void => {
	if (!(error instanceof Error)) return;
	(error as ErrorWithCascadeReplayState)[cascadeReplayStateKey] = state;
};

/** Reads replay state from an error, walking the `cause` chain. */
export const getCascadeReplayState = (
	error: unknown,
): CascadeReplayState | undefined => {
	let current = error;
	const seen = new Set<unknown>();
	while (current instanceof Error && !seen.has(current)) {
		seen.add(current);
		const state = (current as ErrorWithCascadeReplayState)[
			cascadeReplayStateKey
		];
		if (state) return state;
		current = current.cause;
	}
	return undefined;
};

/**
 * Replay deductions for a cascade whose included leg already persisted: the
 * single overage leg scaled by the event fraction the included leg never
 * covered, with the cascade marker stripped so it executes as a plain
 * deduction. Returns null when the deductions contain no overage leg.
 */
export const buildCascadeReplayDeductions = ({
	featureDeductions,
	replayState,
}: {
	featureDeductions: FeatureDeduction[];
	replayState: CascadeReplayState;
}): FeatureDeduction[] | null => {
	const overageDeduction = featureDeductions.find(
		(deduction) => deduction.cascade?.role === "overage",
	);
	if (!overageDeduction) return null;

	return [
		{
			...overageDeduction,
			deduction: overageDeduction.deduction * replayState.spillRemaining,
			cascade: undefined,
		},
	];
};
