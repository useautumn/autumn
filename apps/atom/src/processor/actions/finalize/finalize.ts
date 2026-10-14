import {
	computeFinalizeDecision,
	type FinalizeCommand,
	type WorkerLock,
} from "@autumn/balance-engine";
import { findFeatureById, InsufficientBalanceError } from "@autumn/shared";
import { CannotAnswerError } from "../../../lib/forward/cannotAnswerError.js";
import type { CurrentSubject } from "../../types/currentSubject.js";
import type {
	AnswerableFinalize,
	FinalizeRequest,
	FinalizeResponse,
} from "../../types/finalize.js";
import type { SlotProcessorContext } from "../../types/slotProcessor.js";
import { readCurrentSubject } from "../readCurrentSubject/readCurrentSubject.js";
import { heldLockRowOf } from "./heldLockRowOf.js";

/** The request reduced to what the Atom settles: the lock, and the value its action names. */
const finalizeRequestToAnswerable = ({
	request: { params },
}: {
	request: FinalizeRequest;
}): AnswerableFinalize => ({
	customerId: params.customer_id,
	lockId: params.lock_id,
	finalValue: params.action === "release" ? 0 : (params.override_value ?? null),
	properties: params.properties ?? null,
});

/** The worker's finalize, as the API builds it: the lock's own row, settled at the value the action names. */
const finalizeToCommand = ({
	request,
	finalize,
	lock,
	subject,
}: {
	request: FinalizeRequest;
	finalize: AnswerableFinalize;
	lock: WorkerLock;
	subject: CurrentSubject;
}): FinalizeCommand => {
	const feature = findFeatureById({
		features: subject.features,
		featureId: lock.feature_id,
	});
	if (!feature) throw new CannotAnswerError({ reason: "feature_not_stored" });
	return {
		schemaVersion: 1,
		type: "finalize",
		requestId: request.requestId,
		identity: subject.fullSubject.identity,
		occurredAt: request.occurredAt,
		commandId: request.requestId,
		org: subject.org,
		lock,
		internalFeatureId: feature.internal_id,
		finalValue: finalize.finalValue,
		properties: finalize.properties,
	};
};

/**
 * A finalize of a lock this slot took, settled on the view and journaled after the lock's own track, so Autumn applies
 * the two in order. A lock this slot holds no row for (the API's, or one taken elsewhere: parked D1) is the API's.
 */
export const finalize = async ({
	ctx,
	request,
}: {
	ctx: SlotProcessorContext;
	request: FinalizeRequest;
}): Promise<FinalizeResponse> => {
	const answerable = finalizeRequestToAnswerable({ request });
	const { customerId, lockId } = answerable;
	const lock = heldLockRowOf({ ctx, customerId, lockId });
	if (!lock) throw new CannotAnswerError({ reason: "lock_not_held" });

	const subject = readCurrentSubject({ ctx, customerId, entityId: null });
	const command = finalizeToCommand({
		request,
		finalize: answerable,
		lock,
		subject,
	});
	// A lock no longer open throws LockNotFoundError: settled here already, or expired at Autumn.
	const { result } = computeFinalizeDecision({
		fullSubject: subject.fullSubject,
		command,
	}).mutation;
	if (result.type !== "finalize")
		throw new Error(
			`Finalize ${command.commandId} decided a non-finalize result`,
		);
	if (result.status === "rejected")
		throw new InsufficientBalanceError({
			featureId: lock.feature_id,
			value: result.finalValue,
		});

	await ctx.journal.append({ customerId, command }).catch(() => {
		throw new CannotAnswerError({ reason: "journal_not_written" });
	});
	return { success: true };
};
