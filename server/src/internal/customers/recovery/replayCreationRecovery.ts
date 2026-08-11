import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	type EntityCreationRecoveryPayload,
	isEntityCreationRecoveryPayload,
} from "@/internal/entities/recovery/entityCreationRecoveryTypes.js";
import { replayFailedEntityCreation } from "@/internal/entities/recovery/replayFailedEntityCreation.js";
import type { CustomerCreationRecoveryPayload } from "./customerCreationRecoveryTypes.js";
import { replayFailedCustomerCreation } from "./replayFailedCustomerCreation.js";

/** Customer get-or-create and entity creation captures share one queue, so the
 *  drain routes on the payload. Untagged payloads are customer captures — the
 *  only shape that existed before entities joined the queue. */
export const replayCreationRecovery = async ({
	ctx,
	payload,
}: {
	ctx: AutumnContext;
	payload: CustomerCreationRecoveryPayload | EntityCreationRecoveryPayload;
}) => {
	if (isEntityCreationRecoveryPayload(payload)) {
		await replayFailedEntityCreation({ ctx, payload });
		return;
	}

	// An absent tag is a legacy customer capture. A tag we don't recognise is a
	// routing gap, and replaying it as a customer would fail confusingly.
	const kind = (payload as { kind?: unknown }).kind;
	if (kind !== undefined) {
		ctx.logger.warn(
			"[creationRecovery] Unrecognised payload kind, replaying as customer",
			{ kind, requestId: payload.requestId },
		);
	}

	await replayFailedCustomerCreation({ ctx, payload });
};
