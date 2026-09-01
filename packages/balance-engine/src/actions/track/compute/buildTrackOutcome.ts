import { Decimal } from "decimal.js";
import { balanceOf } from "../../../common/balanceUtils.js";
import type { BalanceMutation } from "../../../common/types/balanceMutation.js";
import type {
	CustomerMeteringState,
	LeanCustomerEntitlement,
} from "../../../common/types/customerState/customerStateTypes.js";
import {
	type TrackCommand,
	trackCommandFingerprintOf,
} from "../types/trackCommand.js";
import {
	type TrackOutcome,
	trackOutcomeSchema,
} from "../types/trackOutcome.js";

const balanceAfterMutations = ({
	customerEntitlements,
	mutations,
}: {
	customerEntitlements: LeanCustomerEntitlement[];
	mutations: BalanceMutation[];
}): number => {
	const mutationByCustomerEntitlementId = new Map(
		mutations.map((mutation) => [mutation.customerEntitlementId, mutation]),
	);
	return customerEntitlements
		.reduce(
			(total, customerEntitlement) =>
				total.plus(
					mutationByCustomerEntitlementId.get(customerEntitlement.id)
						?.balanceAfter ?? customerEntitlement.balance,
				),
			new Decimal(0),
		)
		.toNumber();
};

// Assembles the durable event and runs it through its own schema, so a buggy
// decision fails here rather than after publishing.
export const buildTrackOutcome = ({
	state,
	command,
	customerEntitlements,
	rejected,
	appliedValue,
	mutations,
}: {
	state: CustomerMeteringState;
	command: TrackCommand;
	customerEntitlements: LeanCustomerEntitlement[];
	rejected: boolean;
	appliedValue: Decimal;
	mutations: BalanceMutation[];
}): TrackOutcome => {
	const balanceBefore = balanceOf({ customerEntitlements });

	return trackOutcomeSchema.parse({
		schemaVersion: 1,
		type: "track_outcome",
		commandId: command.commandId,
		commandFingerprint: trackCommandFingerprintOf({ command }),
		requestId: command.requestId,
		identity: command.identity,
		entityId: command.entityId,
		featureId: command.featureId,
		requestedValue: command.value,
		appliedValue: appliedValue.toNumber(),
		overageBehavior: command.overageBehavior,
		properties: command.properties,
		status: rejected ? "rejected" : "applied",
		reason: rejected ? "insufficient_balance" : null,
		balanceBefore,
		balanceAfter: rejected
			? balanceBefore
			: balanceAfterMutations({ customerEntitlements, mutations }),
		revisionBefore: state.revision,
		revisionAfter: state.revision + 1,
		mutations,
		occurredAt: command.occurredAt,
	});
};
