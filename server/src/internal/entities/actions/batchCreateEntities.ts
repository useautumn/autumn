import {
	type CreateEntityParams,
	type CustomerData,
	type Entity,
	findFeatureById,
} from "@autumn/shared";
import { shed503OnTransientError } from "@/db/shed503OnTransientError.js";
import { withLock } from "@/external/redis/utils/lockUtils/withLock.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { EntityService } from "@/internal/api/entities/EntityService";
import {
	ENTITY_CREATION_WROTE_KEY,
	entityCreationWrote,
} from "@/internal/entities/recovery/entityCreationRecoveryTypes.js";
import { queueFailedEntityCreation } from "@/internal/entities/recovery/queueFailedEntityCreation.js";
import { getApiEntity } from "../entityUtils/apiEntityUtils/getApiEntity";
import { constructEntity } from "../entityUtils/entityUtils";
import { createEntityForCusProduct } from "../handlers/handleCreateEntity/createEntityForCusProduct";
import { validateAndGetInputEntities } from "../handlers/handleCreateEntity/getInputEntities";
import { attachDefaultProductsToEntities } from "./batchCreateEntities/attachDefaultProductsToEntities";

type BatchCreateEntitiesParams = {
	ctx: AutumnContext;
	customerData?: CustomerData;
	customerId: string;
	createEntityData: CreateEntityParams[] | CreateEntityParams;
	withAutumnId?: boolean;
	source?: string;
	enqueueRecoveryOnTransientFailure?: boolean;
};

const createEntities = async ({
	ctx,
	customerId,
	customerData,
	createEntityData,
	withAutumnId = false,
}: BatchCreateEntitiesParams) => {
	const { db, org, env, features } = ctx;

	// 1. Get data
	const {
		customer: fullCus,
		inputEntities,
		cusProducts,
		existingEntities,
	} = await validateAndGetInputEntities({
		ctx,
		customerId,
		customerData,
		createEntityData,
	});

	// Past here a failure can leave state no later read can find: a decremented
	// balance with no row, or a committed row whose defaults never attached.
	ctx.extraLogs[ENTITY_CREATION_WROTE_KEY] = true;

	for (const cusProduct of cusProducts) {
		await createEntityForCusProduct({
			ctx,
			customer: fullCus,
			cusProduct,
			inputEntities,
		});
	}

	let data = inputEntities.map((e) =>
		constructEntity({
			inputEntity: e,
			feature: findFeatureById({
				features,
				featureId: e.feature_id,
				errorOnNotFound: true,
			}),
			internalCustomerId: fullCus.internal_id,
			orgId: org.id,
			env,
		}),
	);

	const newEntities: Entity[] = [];

	const noIdEntity = existingEntities.find((e) => e.id === null);
	if (noIdEntity) {
		const updatedEntity = await EntityService.update({
			db,
			internalId: noIdEntity.internal_id,
			update: {
				id: inputEntities[0].id,
				name: inputEntities[0].name,
				...(inputEntities[0].billing_controls && {
					spend_limits: inputEntities[0].billing_controls.spend_limits,
					usage_limits: inputEntities[0].billing_controls.usage_limits,
					usage_alerts: inputEntities[0].billing_controls.usage_alerts,
					overage_allowed: inputEntities[0].billing_controls.overage_allowed,
				}),
			},
		});

		data = data.slice(1);
		newEntities.push(updatedEntity);
	}

	const insertedEntities = await EntityService.insert({
		db,
		data,
	});

	newEntities.push(...insertedEntities);

	await attachDefaultProductsToEntities({
		ctx,
		fullCustomer: fullCus,
		entities: newEntities,
		customerData,
	});

	// Get api entity for each entity...
	const apiEntities = [];
	for (const entity of newEntities) {
		const clonedFullCus = structuredClone(fullCus);
		clonedFullCus.entity = entity;

		const apiEntity = await getApiEntity({
			ctx,
			customerId,
			entityId: entity.id ?? entity.internal_id,
			fullCus: clonedFullCus,
			withAutumnId,
		});
		apiEntities.push(apiEntity);
	}

	return apiEntities;
};

export const batchCreateEntities = async (
	params: BatchCreateEntitiesParams,
) => {
	const {
		ctx,
		customerId,
		createEntityData,
		customerData,
		withAutumnId,
		source,
		enqueueRecoveryOnTransientFailure = true,
	} = params;
	const { org, env } = ctx;

	// No Postgres fallback: a write path has no cache-only read to re-serve. The
	// lock fails open on Redis, so in practice only DB transients shed here.
	return shed503OnTransientError({
		ctx,
		source: "entities.create",
		run: () =>
			withLock({
				lockKey: `lock:create-entity-request:${org.id}:${env}:${customerId}`,
				errorMessage:
					"Entity creation already in progress for this customer, try again in a few seconds",
				fn: () => createEntities(params),
			}),
		onTransientError: enqueueRecoveryOnTransientFailure
			? async () => {
					await queueFailedEntityCreation({
						ctx,
						params: {
							customer_id: customerId,
							create_entity_data: Array.isArray(createEntityData)
								? createEntityData
								: [createEntityData],
							customer_data: customerData,
						},
						source,
						withAutumnId,
						mayHaveWritten: entityCreationWrote({ ctx }),
					});
				}
			: undefined,
	});
};
