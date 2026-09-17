import { Decimal } from "decimal.js";
import { computeDeduction } from "../../common/deduction/computeDeduction.js";
import type { Catalog } from "../../models/catalog/catalog.js";
import type { CustomerState } from "../../models/customerState.js";
import type { CustomerStateMutation } from "../../models/customerStateMutation.js";
import type { RowChange } from "../../models/rowChange.js";
import type { WorkerCustomerEntitlement } from "../../models/rows/workerCustomerEntitlement.js";
import { mutationFingerprintOf } from "../../mutation/mutationFingerprintOf.js";
import { parseCustomerStateMutation } from "../../parsers.js";
import {
	availableBalanceOf,
	balanceOf,
} from "../../utils/customerStateUtils/balanceOf.js";
import { findCustomerEntitlementsForFeature } from "../../utils/customerStateUtils/findCustomerEntitlementsForFeature.js";
import { identitiesMatch } from "../../utils/identityUtils/identitiesMatch.js";
import type { TrackCommand, TrackCommandEcho } from "./types/trackCommand.js";
import type { TrackDecision } from "./types/trackDecision.js";
import { validateTrackMutation } from "./validateTrackMutation.js";

type UnsupportedTrackDecision = Extract<TrackDecision, { kind: "unsupported" }>;

type TrackClassification =
	| { kind: "supported"; customerEntitlements: WorkerCustomerEntitlement[] }
	| UnsupportedTrackDecision;

const classifyTrackCommand = ({
	state,
	catalog,
	command,
}: {
	state: CustomerState;
	catalog: Catalog;
	command: TrackCommand;
}): TrackClassification => {
	if (!identitiesMatch({ left: state.identity, right: command.identity })) {
		return { kind: "unsupported", reason: "subject_mismatch" };
	}
	if (command.identity.entityId) {
		return { kind: "unsupported", reason: "entity_not_supported" };
	}
	if (command.properties && Object.keys(command.properties).length > 0) {
		return { kind: "unsupported", reason: "properties_not_supported" };
	}
	if (command.value < 0) {
		return { kind: "unsupported", reason: "refund_not_supported" };
	}

	const customerEntitlements = findCustomerEntitlementsForFeature({
		state,
		catalog,
		featureId: command.featureId,
	});
	if (customerEntitlements.length === 0) {
		return { kind: "unsupported", reason: "feature_not_found" };
	}
	if (customerEntitlements.length > 1) {
		return {
			kind: "unsupported",
			reason: "multiple_customer_entitlements_not_supported",
		};
	}

	return { kind: "supported", customerEntitlements };
};

const customerEntitlementAfterChanges = ({
	customerEntitlement,
	changes,
}: {
	customerEntitlement: WorkerCustomerEntitlement;
	changes: RowChange[];
}): WorkerCustomerEntitlement => {
	for (const change of changes) {
		if (
			change.table === "customerEntitlements" &&
			change.op === "update" &&
			change.id === customerEntitlement.id
		) {
			return { ...customerEntitlement, ...change.after };
		}
	}
	return customerEntitlement;
};

const buildTrackMutation = ({
	state,
	command,
	customerEntitlements,
	rejected,
	appliedValue,
	changes,
	deduplicationExpiresAt,
}: {
	state: CustomerState;
	command: TrackCommand;
	customerEntitlements: WorkerCustomerEntitlement[];
	rejected: boolean;
	appliedValue: Decimal;
	changes: RowChange[];
	deduplicationExpiresAt: number;
}): CustomerStateMutation => {
	const customerEntitlementsAfter = customerEntitlements.map(
		(customerEntitlement) =>
			customerEntitlementAfterChanges({ customerEntitlement, changes }),
	);
	const mutationCommand: TrackCommandEcho = {
		type: "track",
		requestId: command.requestId,
		occurredAt: command.occurredAt,
		featureId: command.featureId,
		value: command.value,
		overageBehavior: command.overageBehavior,
		properties: command.properties,
	};

	return parseCustomerStateMutation({
		input: {
			schemaVersion: 1,
			type: "mutation",
			id: command.commandId,
			identity: command.identity,
			revision: { before: state.revision, after: state.revision + 1 },
			command: mutationCommand,
			changes,
			result: {
				type: "track",
				status: rejected ? "rejected" : "applied",
				reason: rejected ? "insufficient_balance" : null,
				requestedValue: command.value,
				appliedValue: appliedValue.toNumber(),
				balanceBefore: balanceOf({ customerEntitlements }),
				balanceAfter: balanceOf({
					customerEntitlements: customerEntitlementsAfter,
				}),
				customerEntitlement: customerEntitlementsAfter[0],
			},
			receipt: {
				fingerprint: mutationFingerprintOf({
					mutation: {
						identity: command.identity,
						command: mutationCommand,
						changes,
					},
				}),
				expiresAt: deduplicationExpiresAt,
			},
		},
	});
};

/** Pure: same state, catalog and command always yield the same decision. Deduplication is the writer's job. */
export const computeTrack = ({
	state,
	catalog,
	command,
	deduplicationExpiresAt,
}: {
	state: CustomerState;
	catalog: Catalog;
	command: TrackCommand;
	deduplicationExpiresAt: number;
}): TrackDecision => {
	const classification = classifyTrackCommand({ state, catalog, command });
	if (classification.kind !== "supported") return classification;

	const { customerEntitlements } = classification;
	const requestedValue = new Decimal(command.value);
	const rejected =
		command.overageBehavior === "reject" &&
		availableBalanceOf({ customerEntitlements }).lt(requestedValue);
	const deduction = rejected
		? { appliedValue: new Decimal(0), changes: [] }
		: computeDeduction({
				customerEntitlements,
				value: requestedValue,
				overageBehavior: command.overageBehavior,
			});
	const mutation = buildTrackMutation({
		state,
		command,
		customerEntitlements,
		rejected,
		appliedValue: deduction.appliedValue,
		changes: deduction.changes,
		deduplicationExpiresAt,
	});

	validateTrackMutation({ mutation });

	return { kind: "new", mutation };
};
