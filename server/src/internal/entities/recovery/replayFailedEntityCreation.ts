import {
	ApiVersionClass,
	type CreateEntityParams,
	type Entity,
	type FullCustomer,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusService } from "@/internal/customers/CusService.js";
import { batchCreateEntities } from "../actions/batchCreateEntities.js";
import {
	ENTITY_CREATION_MANUAL_REVIEW_STAGES,
	type EntityCreationRecoveryPayload,
} from "./entityCreationRecoveryTypes.js";

const listExistingEntities = async ({
	ctx,
	customerId,
}: {
	ctx: AutumnContext;
	customerId: string;
}): Promise<Entity[]> => {
	const customer: FullCustomer | undefined = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
		withEntities: true,
		allowNotFound: true,
	});

	return customer?.entities ?? [];
};

const isAlreadyCreated = ({
	ctx,
	inputEntity,
	existingEntities,
}: {
	ctx: AutumnContext;
	inputEntity: CreateEntityParams;
	existingEntities: Entity[];
}) => {
	if (inputEntity.id) {
		return existingEntities.some(
			(entity) => entity.id === inputEntity.id && !entity.deleted,
		);
	}

	// A customer may hold only one id-less entity per feature, so an id-less row
	// on this feature is the one the shed request created.
	const internalFeatureId = ctx.features.find(
		(feature) => feature.id === inputEntity.feature_id,
	)?.internal_id;

	return existingEntities.some(
		(entity) =>
			entity.id === null &&
			!entity.deleted &&
			entity.internal_feature_id === internalFeatureId,
	);
};

export const replayFailedEntityCreation = async ({
	ctx,
	payload,
}: {
	ctx: AutumnContext;
	payload: EntityCreationRecoveryPayload;
}) => {
	if (ENTITY_CREATION_MANUAL_REVIEW_STAGES.has(payload.failureStage)) {
		throw new Error(
			`Entity creation recovery ${payload.requestId} requires manual billing review (failed at ${payload.failureStage})`,
		);
	}

	ctx.apiVersion = new ApiVersionClass(payload.apiVersion);
	// Both create handlers read through to Postgres; a replay must do the same or
	// it decides idempotency from a cache the shed request already invalidated.
	ctx.skipCache = true;

	const { customer_id: customerId, create_entity_data: createEntityData } =
		payload.params;

	const existingEntities = await listExistingEntities({ ctx, customerId });
	const pending = createEntityData.filter(
		(inputEntity) => !isAlreadyCreated({ ctx, inputEntity, existingEntities }),
	);

	const replayLog = {
		sourceRequestId: payload.requestId,
		failureStage: payload.failureStage,
		createdCount: pending.length,
		skippedCount: createEntityData.length - pending.length,
	};

	if (pending.length === 0) {
		ctx.extraLogs.entityCreationRecoveryReplay = {
			outcome: "already_exists",
			...replayLog,
		};
		ctx.logger.info(
			"[entityCreationRecovery] Replay skipped, entities already exist",
			replayLog,
		);
		return;
	}

	await batchCreateEntities({
		ctx,
		customerId,
		createEntityData: pending,
		customerData: payload.params.customer_data,
		withAutumnId: payload.withAutumnId,
		source: "entityCreationRecovery",
		enqueueRecoveryOnTransientFailure: false,
	});

	ctx.extraLogs.entityCreationRecoveryReplay = {
		outcome: "created",
		...replayLog,
	};
	ctx.logger.info("[entityCreationRecovery] Replay completed", replayLog);
};
