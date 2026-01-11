import {
	type AppEnv,
	type CheckParams,
	CusExpand,
	type CustomerData,
	type Entity,
	type EntityData,
	type FullCustomer,
	type TrackParams,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { autoCreateEntity } from "@/internal/entities/handlers/handleCreateEntity/autoCreateEntity.js";
import { CusService } from "../../CusService.js";
import { handleCreateCustomer } from "../../handlers/handleCreateCustomer.js";
import { updateCustomerDetails } from "../cusUtils.js";
import { getCachedFullCustomer } from "./getCachedFullCustomer.js";
import { setCachedFullCustomer } from "./setCachedFullCustomer.js";

/**
 * Get FullCustomer from cache, or fetch from DB, or create if not found
 */
export const getOrCreateCachedFullCustomer = async ({
	ctx,
	params,
	source,
}: {
	ctx: AutumnContext;
	params: TrackParams | CheckParams;
	source?: string;
}): Promise<FullCustomer> => {
	const { org, env, db, skipCache, logger } = ctx;
	const {
		customer_id: customerId,
		customer_data: customerData,
		entity_id: entityId,
		entity_data: entityData,
	} = params;

	let fullCustomer: FullCustomer | undefined;
	const fetchTimeMs = Date.now();

	// 1. Try cache first
	if (customerId && !skipCache) {
		fullCustomer =
			(await getCachedFullCustomer({ orgId: org.id, env, customerId })) ??
			undefined;

		if (fullCustomer) {
			logger.debug(`[getOrCreateCachedFullCustomer] Cache hit: ${customerId}`);
			return fullCustomer;
		}
	}

	// 2. Try DB if not in cache
	if (!fullCustomer && customerId) {
		fullCustomer = await CusService.getFull({
			db,
			idOrInternalId: customerId,
			orgId: org.id,
			env: env as AppEnv,
			withEntities: true,
			withSubs: true,
			expand: [CusExpand.Invoices],
			allowNotFound: true,
		});
	}

	// 3. Create if not found
	if (!fullCustomer) {
		try {
			fullCustomer = (await handleCreateCustomer({
				ctx,
				cusData: {
					id: customerId,
					name: customerData?.name,
					email: customerData?.email,
					fingerprint: customerData?.fingerprint,
					metadata: customerData?.metadata || {},
					stripe_id: customerData?.stripe_id,
				},
				createDefaultProducts: customerData?.disable_default !== true,
			})) as FullCustomer;

			fullCustomer = await CusService.getFull({
				db,
				idOrInternalId: customerId || fullCustomer.internal_id,
				orgId: org.id,
				env: env as AppEnv,
				withEntities: true,
				withSubs: true,
				expand: [CusExpand.Invoices],
			});
		} catch (error: unknown) {
			const errorData = (error as { data?: { code?: string } })?.data;
			if (errorData?.code === "23505" && customerId) {
				fullCustomer = await CusService.getFull({
					db,
					idOrInternalId: customerId,
					orgId: org.id,
					env: env as AppEnv,
					withEntities: true,
					withSubs: true,
					expand: [CusExpand.Invoices],
				});
			} else {
				throw error;
			}
		}
	}

	// 4. Update customer details if provided
	const updated = await updateCustomerDetails({
		ctx,
		customer: fullCustomer,
		customerData,
	});

	if (updated) {
		fullCustomer = await CusService.getFull({
			db,
			idOrInternalId: fullCustomer.id || fullCustomer.internal_id,
			orgId: org.id,
			env: env as AppEnv,
			withEntities: true,
			withSubs: true,
			expand: [CusExpand.Invoices],
		});
	}

	// 5. Auto-create entity if needed
	if (entityId && !fullCustomer.entity) {
		const existingEntity = fullCustomer.entities?.find(
			(e) => e.id === entityId,
		);

		if (existingEntity) {
			fullCustomer.entity = existingEntity;
		} else {
			logger.info(
				`Auto creating entity ${entityId} for customer ${customerId}`,
			);

			const newEntity = (await autoCreateEntity({
				ctx,
				customerId: fullCustomer.id || fullCustomer.internal_id,
				entityId,
				entityData: {
					name: entityData?.name,
					feature_id: entityData?.feature_id || "",
				},
			})) as Entity;

			fullCustomer.entities = [...(fullCustomer.entities || []), newEntity];
			fullCustomer.entity = newEntity;
		}
	}

	// 6. Set cache (await to ensure it's ready before Redis deduction)
	if (!skipCache) {
		await setCachedFullCustomer({
			ctx,
			fullCustomer,
			customerId: fullCustomer.id || fullCustomer.internal_id,
			fetchTimeMs,
			source,
		}).catch((err) => logger.error(`Failed to set cache: ${err}`));
	}

	return fullCustomer;
};
