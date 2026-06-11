import type { DeductionOptions } from "../types/deductionTypes.js";
import type { FeatureDeduction } from "../types/featureDeduction.js";
import type { MutationLogItem } from "../types/mutationLogItem.js";

type OverageBehaviour = NonNullable<DeductionOptions["overageBehaviour"]>;

/**
 * Leftover event fractions below this are float residue from the engine's
 * credit-cost round-trips, not real usage; they round to zero instead of
 * producing dust charges on the overage leg.
 */
const SPILL_EPSILON = 1e-12;

/**
 * Coordinates a token cascade across an executor's sequential per-feature
 * deduction calls: the "included" leg always runs with overage behaviour
 * "cap" and reports its leftover event fraction, and the "overage" leg's
 * amount is scaled by that fraction. The included leg's mutations are kept so
 * a failed overage leg can be compensated with an exact inline unwind.
 */
export class CascadeSpill {
	private spillRemaining: number | null = null;
	private includedDeduction: FeatureDeduction | null = null;
	private includedDeductedUnits = 0;
	private includedMutationLogs: MutationLogItem[] = [];

	effectiveOverageBehaviour({
		deduction,
		requestBehaviour,
	}: {
		deduction: FeatureDeduction;
		requestBehaviour: OverageBehaviour;
	}): OverageBehaviour {
		return deduction.cascade?.role === "included" ? "cap" : requestBehaviour;
	}

	/**
	 * Amount the executor should deduct for this leg. Returns 0 for an overage
	 * leg whose included leg already covered the full event — the executor
	 * skips the engine call entirely in that case.
	 */
	effectiveAmount({ deduction }: { deduction: FeatureDeduction }): number {
		if (deduction.cascade?.role !== "overage" || this.spillRemaining === null) {
			return deduction.deduction;
		}
		return deduction.deduction * this.spillRemaining;
	}

	/**
	 * Records the included leg's outcome. `remaining` is the engine-reported
	 * leftover in event-fraction units; an unlimited short-circuit records
	 * remaining 0 with no mutation logs.
	 */
	recordIncludedResult({
		deduction,
		remaining,
		mutationLogs,
	}: {
		deduction: FeatureDeduction;
		remaining: number;
		mutationLogs: MutationLogItem[];
	}): void {
		if (deduction.cascade?.role !== "included") return;
		let clampedRemaining = Math.min(
			Math.max(remaining, 0),
			deduction.deduction,
		);
		if (clampedRemaining < SPILL_EPSILON) {
			clampedRemaining = 0;
		}
		this.spillRemaining = clampedRemaining;
		this.includedDeduction = deduction;
		this.includedDeductedUnits = deduction.deduction - clampedRemaining;
		this.includedMutationLogs = mutationLogs;
	}

	/**
	 * Compensating deduction that exactly reverses the included leg, for when a
	 * later overage leg fails. Null when the included leg consumed nothing.
	 */
	buildCompensation(): FeatureDeduction | null {
		if (
			!this.includedDeduction ||
			this.includedDeductedUnits <= 0 ||
			this.includedMutationLogs.length === 0
		) {
			return null;
		}
		return {
			feature: this.includedDeduction.feature,
			deduction: 0,
			tokens: this.includedDeduction.tokens,
			unwindValue: this.includedDeductedUnits,
			unwindItems: this.includedMutationLogs,
		};
	}
}
