import { Decimal } from "decimal.js";
import type { CustomerMeteringState } from "../../../common/types/customerState/customerStateTypes.js";
import { deductFromCustomerEntitlements } from "../../../deduction/deductFromCustomerEntitlements.js";
import type { TrackCommand } from "../types/trackCommand.js";
import type { TrackDecision } from "../types/trackDecision.js";
import type { TrackOutcome } from "../types/trackOutcome.js";
import { buildTrackOutcome } from "./buildTrackOutcome.js";
import { classifyTrackCommand } from "./classifyTrackCommand.js";

// Decides what a track should do without mutating anything. The outcome it
// returns is a proposal; only executeTrack (after durability) advances state.
export const computeTrack = ({
	state,
	command,
	existingReceipt = null,
}: {
	state: CustomerMeteringState;
	command: TrackCommand;
	existingReceipt?: TrackOutcome | null;
}): TrackDecision => {
	// 1. Classify — duplicates, conflicts, and unsupported inputs resolve here.
	const classified = classifyTrackCommand({ state, command, existingReceipt });
	if (classified) return classified;

	const customerEntitlements =
		state.customerEntitlementsByFeatureId[command.featureId];
	if (!customerEntitlements) {
		return { kind: "unsupported", reason: "feature_not_found" };
	}

	// 2. Deduct — the pure kernel folds the value across the entitlement rows.
	// A reject-mode shortfall surfaces as leftover value: the whole deduction
	// is then abandoned, so a rejected outcome moves nothing.
	const deduction = deductFromCustomerEntitlements({
		customerEntitlements,
		value: new Decimal(command.value),
		overageBehavior: command.overageBehavior,
	});

	const rejected =
		command.overageBehavior === "reject" && deduction.remaining.gt(0);

	const { appliedValue, mutations } = rejected
		? { appliedValue: new Decimal(0), mutations: [] }
		: deduction;

	// 3. Build — assemble the durable outcome and self-validate it.
	return {
		kind: "new",
		outcome: buildTrackOutcome({
			state,
			command,
			customerEntitlements,
			rejected,
			appliedValue,
			mutations,
		}),
	};
};
