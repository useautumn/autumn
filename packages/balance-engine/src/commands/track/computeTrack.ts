import {
	cusEntsToBalance,
	cusEntToBalance,
	fullSubjectToCustomerEntitlements,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import { computeDeduction } from "../../common/deduction/computeDeduction.js";
import type { UnsupportedDecision } from "../../models/common/decision.js";
import type { RowChange } from "../../models/rowChange.js";
import type {
	WorkerFullCustomerEntitlement,
	WorkerFullSubject,
} from "../../models/subject/workerFullSubject.js";
import type { SubjectStateMutation } from "../../models/subjectStateMutation.js";
import { mutationToFingerprint } from "../../mutation/mutationToFingerprint.js";
import { parseSubjectStateMutation } from "../../parsers.js";
import { isSameCustomerIdentity } from "../../utils/identityUtils/classifyIdentityUtils.js";
import { fullCustomerEntitlementToRow } from "../../utils/subjectUtils/convertSubjectUtils.js";
import type { TrackCommand, TrackCommandEcho } from "./types/trackCommand.js";
import type { TrackDecision } from "./types/trackDecision.js";
import { validateTrackMutation } from "./validateTrackMutation.js";

type TrackClassification =
	| { kind: "supported"; customerEntitlements: WorkerFullCustomerEntitlement[] }
	| UnsupportedDecision;

const classifyTrackCommand = ({
	fullSubject,
	command,
}: {
	fullSubject: WorkerFullSubject;
	command: TrackCommand;
}): TrackClassification => {
	if (
		!isSameCustomerIdentity({
			left: fullSubject.identity,
			right: command.identity,
		})
	) {
		return { kind: "unsupported", reason: "subject_mismatch" };
	}
	if (command.identity.entityId && !fullSubject.entity) {
		return { kind: "unsupported", reason: "entity_not_found" };
	}
	if (command.properties && Object.keys(command.properties).length > 0) {
		return { kind: "unsupported", reason: "properties_not_supported" };
	}
	if (command.value < 0) {
		return { kind: "unsupported", reason: "refund_not_supported" };
	}

	const customerEntitlements = fullSubjectToCustomerEntitlements({
		fullSubject,
		featureIds: [command.featureId],
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

/** A reject-mode track can only spend what is above zero; an overdrawn row lends nothing. */
const availableBalanceOf = ({
	customerEntitlements,
}: {
	customerEntitlements: WorkerFullCustomerEntitlement[];
}): Decimal =>
	customerEntitlements.reduce(
		(total, cusEnt) => total.plus(Decimal.max(cusEntToBalance({ cusEnt }), 0)),
		new Decimal(0),
	);

const customerEntitlementAfterChanges = ({
	customerEntitlement,
	changes,
}: {
	customerEntitlement: WorkerFullCustomerEntitlement;
	changes: RowChange[];
}): WorkerFullCustomerEntitlement => {
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
	fullSubject,
	command,
	customerEntitlements,
	rejected,
	appliedValue,
	changes,
	deduplicationExpiresAt,
}: {
	fullSubject: WorkerFullSubject;
	command: TrackCommand;
	customerEntitlements: WorkerFullCustomerEntitlement[];
	rejected: boolean;
	appliedValue: Decimal;
	changes: RowChange[];
	deduplicationExpiresAt: number;
}): SubjectStateMutation => {
	const customerEntitlementsAfter = customerEntitlements.map(
		(customerEntitlement) =>
			customerEntitlementAfterChanges({ customerEntitlement, changes }),
	);
	const [fundingRowAfter] = customerEntitlementsAfter;
	if (!fundingRowAfter) throw new Error("A supported track funds one row");
	const mutationCommand: TrackCommandEcho = {
		type: "track",
		requestId: command.requestId,
		occurredAt: command.occurredAt,
		featureId: command.featureId,
		value: command.value,
		overageBehavior: command.overageBehavior,
		properties: command.properties,
	};

	return parseSubjectStateMutation({
		input: {
			schemaVersion: 1,
			type: "mutation",
			id: command.commandId,
			identity: command.identity,
			revision: {
				before: fullSubject.revision,
				after: fullSubject.revision + 1,
			},
			command: mutationCommand,
			changes,
			result: {
				type: "track",
				status: rejected ? "rejected" : "applied",
				reason: rejected ? "insufficient_balance" : null,
				requestedValue: command.value,
				appliedValue: appliedValue.toNumber(),
				balanceBefore: cusEntsToBalance({ cusEnts: customerEntitlements }),
				balanceAfter: cusEntsToBalance({ cusEnts: customerEntitlementsAfter }),
				customerEntitlement: fullCustomerEntitlementToRow({
					customerEntitlement: fundingRowAfter,
				}),
			},
			receipt: {
				fingerprint: mutationToFingerprint({
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

/** Pure: the same subject and command always yield the same decision. Deduplication is the writer's job. */
export const computeTrack = ({
	fullSubject,
	command,
	deduplicationExpiresAt,
}: {
	fullSubject: WorkerFullSubject;
	command: TrackCommand;
	deduplicationExpiresAt: number;
}): TrackDecision => {
	const classification = classifyTrackCommand({ fullSubject, command });
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
		fullSubject,
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
