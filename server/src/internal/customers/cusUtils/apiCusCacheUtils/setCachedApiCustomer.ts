import {
	type ApiEntityV1,
	addToExpand,
	CusExpand,
	type EntityLegacyData,
	type FullCustomer,
	filterEntityLevelCusProducts,
	filterOutEntitiesFromCusProducts,
} from "@autumn/shared";
import { redis } from "../../../../external/redis/initRedis.js";
import type { AutumnContext } from "../../../../honoUtils/HonoEnv.js";
import { tryRedisWrite } from "../../../../utils/cacheUtils/cacheUtils.js";
import { getApiEntityBase } from "../../../entities/entityUtils/apiEntityUtils/getApiEntityBase.js";
import { getApiCustomerBase } from "../apiCusUtils/getApiCustomerBase.js";

/**
 * Set customer cache in Redis with all entities
 * This function builds the master customer cache (customer-level features only)
 * and individual entity caches (entity-level features only)
 */
export const setCachedApiCustomer = async ({
	ctx,
	fullCus,
	customerId,
	source,
}: {
	ctx: AutumnContext;
	fullCus: FullCustomer;
	customerId: string;
	source?: string;
}) => {
	const { org, env, logger } = ctx;

	const ctxWithExpand = addToExpand({
		ctx,
		add: [
			CusExpand.BalancesFeature,
			CusExpand.SubscriptionsPlan,
			CusExpand.Invoices,
		],
	});

	// Build master api customer (customer-level features only)
	const { apiCustomer: masterApiCustomer, legacyData } =
		await getApiCustomerBase({
			ctx: ctxWithExpand,
			fullCus: {
				...structuredClone(fullCus),
				customer_products: filterOutEntitiesFromCusProducts({
					cusProducts: fullCus.customer_products,
				}),
			},
			withAutumnId: true,
		});

	// Build entity api customers (entity-level features only)
	const entityLevelCusProducts = filterEntityLevelCusProducts({
		cusProducts: fullCus.customer_products,
	});

	// Build entities first
	const entityBatch: {
		entityId: string;
		entityData: ApiEntityV1 & { legacyData: EntityLegacyData };
	}[] = [];
	const entityFullCus = {
		...fullCus,
		customer_products: entityLevelCusProducts,
	};

	for (const entity of fullCus.entities) {
		const { apiEntity, legacyData: entityLegacyData } = await getApiEntityBase({
			ctx: ctxWithExpand,
			fullCus: entityFullCus,
			entity,
			withAutumnId: true,
		});

		entityBatch.push({
			entityId: entity.id,
			entityData: {
				...apiEntity,
				legacyData: entityLegacyData,
			},
		});
	}

	// Then write to Redis
	const masterApiCustomerData = {
		...masterApiCustomer,
		entities: fullCus.entities.filter((e) => e.id !== null),
		legacyData,
	};

	if (masterApiCustomerData.id === null) return;

	// console.log(
	// 	`Setting cached api customer ${customerId}, masterApiCustomerData: `,
	// 	masterApiCustomerData,
	// );

	await tryRedisWrite(async () => {
		await redis.setCustomer(
			JSON.stringify(masterApiCustomerData),
			org.id,
			env,
			customerId,
		);

		const filteredEntityBatch = entityBatch.filter(
			(e) => e.entityData.id !== null,
		);

		if (entityBatch.length > 0) {
			await redis.setEntitiesBatch(
				JSON.stringify(filteredEntityBatch),
				org.id,
				env,
			);
		}
	});
	logger.info(`Set cached api customer ${customerId}, source: ${source}`);
};
