import {
	ApiVersionClass,
	EntityErrorCode,
	RecaseError,
	tryCatch,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { batchCreateEntities } from "../actions/batchCreateEntities.js";
import type { EntityCreationRecoveryPayload } from "./entityCreationRecoveryTypes.js";

/** The original request landed its entities after all; the replay has nothing left to do. */
const isEntityAlreadyExists = (error: unknown): boolean =>
	error instanceof RecaseError &&
	error.code === EntityErrorCode.EntityAlreadyExists;

export const replayFailedEntityCreation = async ({
	ctx,
	payload,
}: {
	ctx: AutumnContext;
	payload: EntityCreationRecoveryPayload;
}) => {
	ctx.apiVersion = new ApiVersionClass(payload.apiVersion);

	const { error } = await tryCatch(
		batchCreateEntities({
			ctx,
			...payload.params,
			enqueueRecoveryOnTransientFailure: false,
		}),
	);
	if (error && !isEntityAlreadyExists(error)) throw error;

	const outcome = error ? "existing" : "created";
	ctx.extraLogs.entityCreationRecoveryReplay = {
		outcome,
		sourceRequestId: payload.requestId,
	};
	ctx.logger.info("[entityCreationRecovery] Replay completed", {
		outcome,
		sourceRequestId: payload.requestId,
	});
};
