import {
	ApiVersionClass,
	type CreateEntityParams,
	type Customer,
} from "@autumn/shared";
import { isShedError } from "@/db/shed503OnTransientError.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { EntityService } from "@/internal/api/entities/EntityService.js";
import { CusService } from "@/internal/customers/CusService.js";
import { batchCreateEntities } from "../actions/batchCreateEntities.js";
import {
	ENTITY_CREATION_MANUAL_REVIEW_STAGES,
	type EntityCreationRecoveryPayload,
} from "./entityCreationRecoveryTypes.js";

const entityExists = async ({
	ctx,
	customer,
	inputEntity,
}: {
	ctx: AutumnContext;
	customer: Customer;
	inputEntity: CreateEntityParams;
}) => {
	const internalFeatureId = ctx.features.find(
		(feature) => feature.id === inputEntity.feature_id,
	)?.internal_id;
	if (!internalFeatureId) return false;

	// Read per entity rather than through the customer aggregate, which caps how
	// many entities it returns and would report a committed one as missing.
	const entity = inputEntity.id
		? await EntityService.get({
				db: ctx.db,
				id: inputEntity.id,
				internalCustomerId: customer.internal_id,
				internalFeatureId,
			})
		: await EntityService.getNull({
				db: ctx.db,
				orgId: ctx.org.id,
				env: ctx.env,
				internalCustomerId: customer.internal_id,
				internalFeatureId,
			});

	return Boolean(entity) && !entity?.deleted;
};

const requestAlreadyLanded = async ({
	ctx,
	payload,
}: {
	ctx: AutumnContext;
	payload: EntityCreationRecoveryPayload;
}) => {
	const customer = await CusService.get({
		db: ctx.db,
		idOrInternalId: payload.params.customer_id,
		orgId: ctx.org.id,
		env: ctx.env,
	});
	if (!customer) return false;

	for (const inputEntity of payload.params.create_entity_data) {
		if (!(await entityExists({ ctx, customer, inputEntity }))) return false;
	}

	return true;
};

export const replayFailedEntityCreation = async ({
	ctx,
	payload,
}: {
	ctx: AutumnContext;
	payload: EntityCreationRecoveryPayload;
}) => {
	const { customer_id: customerId, create_entity_data: createEntityData } =
		payload.params;

	const replayLog = {
		sourceRequestId: payload.requestId,
		failureStage: payload.failureStage,
		customerId,
		entities: createEntityData.map(({ id, feature_id }) => ({
			id,
			feature_id,
		})),
	};

	if (ENTITY_CREATION_MANUAL_REVIEW_STAGES.has(payload.failureStage)) {
		// The worker acks a non-transient throw and drops the message, so this log
		// is the only surviving record of what the shed request was creating.
		ctx.extraLogs.entityCreationRecoveryReplay = {
			outcome: "manual_review",
			...replayLog,
		};
		ctx.logger.error(
			"[entityCreationRecovery] Replay requires manual billing review",
			replayLog,
		);

		throw new Error(
			`Entity creation recovery ${payload.requestId} requires manual billing review (failed at ${payload.failureStage})`,
		);
	}

	ctx.apiVersion = new ApiVersionClass(payload.apiVersion);
	// Both create handlers read through to Postgres; a replay must do the same or
	// it decides idempotency from a cache the shed request already invalidated.
	ctx.skipCache = true;

	// The request is replayed whole. Nothing was committed at a replayable stage,
	// so its own validation is what decides a batch it can only partly satisfy.
	if (await requestAlreadyLanded({ ctx, payload })) {
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

	try {
		await batchCreateEntities({
			ctx,
			customerId,
			createEntityData,
			customerData: payload.params.customer_data,
			withAutumnId: payload.withAutumnId,
			source: "entityCreationRecovery",
			enqueueRecoveryOnTransientFailure: false,
		});
	} catch (error) {
		// A shed stays in SQS, but anything else drops the message, so the reason
		// the request could not be recreated has to be logged here.
		if (!isShedError({ error })) {
			ctx.extraLogs.entityCreationRecoveryReplay = {
				outcome: "rejected",
				...replayLog,
			};
			ctx.logger.error("[entityCreationRecovery] Replay rejected, dropping", {
				...replayLog,
				error,
			});
		}

		throw error;
	}

	ctx.extraLogs.entityCreationRecoveryReplay = {
		outcome: "created",
		...replayLog,
	};
	ctx.logger.info("[entityCreationRecovery] Replay completed", replayLog);
};
