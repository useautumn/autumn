import {
	type CreateEntityParams,
	type CustomerData,
	type Entity,
	findFeatureById,
} from "@autumn/shared";
import { withLock } from "@/external/redis/redisUtils.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { EntityService } from "@/internal/api/entities/EntityService";
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
};

const createEntities = async ({
	ctx,
	customerId,
	customerData,
	createEntityData,
	withAutumnId = false,
	assertLockOwned = () => undefined,
}: BatchCreateEntitiesParams & { assertLockOwned?: () => void }) => {
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
	assertLockOwned();

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
	const { ctx, customerId } = params;
	const { org, env } = ctx;

	return withLock({
		lockKey: `lock:create-entity-request:${org.id}:${env}:${customerId}`,
		errorMessage:
			"Entity creation already in progress for this customer, try again in a few seconds",
		fn: ({ assertLockOwned }) => createEntities({ ...params, assertLockOwned }),
	});
};
