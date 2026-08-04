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

	await replayFailedCustomerCreation({ ctx, payload });
};
