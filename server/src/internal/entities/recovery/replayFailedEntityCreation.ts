import {
	ApiVersionClass,
	type CreateEntityParams,
	EntityErrorCode,
	RecaseError,
	tryCatch,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusService } from "@/internal/customers/CusService.js";
import { batchCreateEntities } from "../actions/batchCreateEntities.js";
import type {
	EntityCreationRecoveryParams,
	EntityCreationRecoveryPayload,
} from "./entityCreationRecoveryTypes.js";

const isEntityAlreadyExists = (error: unknown): boolean =>
	error instanceof RecaseError &&
	error.code === EntityErrorCode.EntityAlreadyExists;

const listUncreatedEntities = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: EntityCreationRecoveryParams;
}): Promise<CreateEntityParams[]> => {
	const { entities } = await CusService.getFull({
		ctx,
		idOrInternalId: params.customerId,
		withEntities: true,
	});
	const existingIds = new Set(entities.map(({ id }) => id));
	const requested = Array.isArray(params.createEntityData)
		? params.createEntityData
		: [params.createEntityData];
	return requested.filter(({ id }) => !existingIds.has(id ?? null));
};

const createRemaining = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: EntityCreationRecoveryParams;
}): Promise<"created" | "existing"> => {
	const createEntityData = await listUncreatedEntities({ ctx, params });
	if (createEntityData.length === 0) return "existing";
	await batchCreateEntities({
		ctx,
		...params,
		createEntityData,
		enqueueRecoveryOnTransientFailure: false,
	});
	return "created";
};

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

	const outcome = error
		? await createRemaining({ ctx, params: payload.params })
		: "created";
	ctx.extraLogs.entityCreationRecoveryReplay = {
		outcome,
		sourceRequestId: payload.requestId,
	};
	ctx.logger.info("[entityCreationRecovery] Replay completed", {
		outcome,
		sourceRequestId: payload.requestId,
	});
};
