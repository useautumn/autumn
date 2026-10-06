import type { DeductionOutcome } from "../../deduction/types/deductionOutcome.js";
import type { LockRowChange } from "../../models/mutation/rowChange.js";
import type { WorkerFullSubject } from "../../models/subject/workerFullSubject.js";
import type { TrackCommand, TrackLock } from "./types/trackCommand.js";

/** The lock row a locked track inserts: what it deducted, row by row, so a finalize can undo exactly that. */
export const trackLockToRowChange = ({
	lock,
	command,
	fullSubject,
	outcome,
}: {
	lock: TrackLock;
	command: TrackCommand;
	fullSubject: WorkerFullSubject;
	outcome: DeductionOutcome;
}): LockRowChange => ({
	table: "locks",
	op: "insert",
	row: {
		id: lock.id,
		org_id: command.identity.orgId,
		env: command.identity.env,
		lock_id: lock.lockId,
		internal_customer_id: fullSubject.customer.internal_id,
		customer_id: command.identity.customerId,
		entity_id: command.identity.entityId,
		feature_id: command.featureId,
		overage_behavior: command.overageBehavior,
		properties: command.properties,
		deltas: outcome.deltas.map((delta) => {
			if (delta.table !== "customerEntitlements") return delta;
			const row = outcome.context.customerEntitlements.find(
				(row) => row.id === delta.id,
			);
			return { ...delta, balanceResetAt: row?.balance_reset_at ?? 0 };
		}),
		expires_at: lock.expiresAt,
		expiry_action: lock.expiryAction,
		created_at: command.occurredAt,
	},
});
