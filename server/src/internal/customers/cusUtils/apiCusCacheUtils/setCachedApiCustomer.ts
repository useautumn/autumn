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
	fetchTimeMs,
}: {
	ctx: AutumnContext;
	fullCus: FullCustomer;
	customerId: string;
	source?: string;
	fetchTimeMs: number; // Timestamp when data was fetched from Postgres (for stale write prevention)
}) => {
	const { org, env, logger } = ctx;

	const ctxWithExpand = addToExpand({
		ctx,
		add: [
			CusExpand.BalancesFeature,
			CusExpand.SubscriptionsPlan,
			CusExpand.Invoices,
			CusExpand.ScheduledSubscriptionsPlan,
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

	const result = await tryRedisWrite(async () => {
		return redis.setCustomer(
			JSON.stringify(masterApiCustomerData),
			org.id,
			env,
			customerId,
			fetchTimeMs.toString(),
		);
	});

	if (result === "CACHE_EXISTS") {
		logger.info(
			`Cache already exists for customer ${customerId}, source: ${source}`,
		);
		return;
	}

	if (result === "STALE_WRITE") {
		logger.info(
			`Stale write blocked for customer ${customerId}, source: ${source}`,
		);
		return;
	}

	// Write entity caches (only if customer cache was written)
	const filteredEntityBatch = entityBatch.filter(
		(e) => e.entityData.id !== null,
	);

	if (filteredEntityBatch.length > 0) {
		await tryRedisWrite(async () => {
			return redis.setEntitiesBatch(
				JSON.stringify(filteredEntityBatch),
				org.id,
				env,
			);
		});
	}

	logger.info(`Set cached api customer ${customerId}, source: ${source}`);
};
