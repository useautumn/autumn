import {
	type AppEnv,
	type CheckParams,
	CusExpand,
	type Entity,
	type FullCustomer,
	type TrackParams,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { autoCreateEntity } from "@/internal/entities/handlers/handleCreateEntity/autoCreateEntity.js";
import { CusService } from "../../CusService.js";
import { handleCreateCustomer } from "../../handlers/handleCreateCustomer.js";
import { updateCustomerDetails } from "../cusUtils.js";
import { deleteCachedFullCustomer } from "./deleteCachedFullCustomer.js";
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
	params: Omit<TrackParams | CheckParams, "customer_id"> & {
		customer_id: string | null;
	};
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
	let setCache = true;
	if (customerId && !skipCache) {
		fullCustomer =
			(await getCachedFullCustomer({
				orgId: org.id,
				env,
				customerId,
				entityId,
			})) ?? undefined;

		if (fullCustomer) {
			logger.debug(`[getOrCreateCachedFullCustomer] Cache hit: ${customerId}`);
			setCache = false;
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
				entityId,
				expand: [CusExpand.Invoices],
			});
			// biome-ignore lint/suspicious/noExplicitAny: it's fine.
		} catch (error: any) {
			if (error?.code === "23505" && customerId) {
				ctx.logger.debug(
					`[getOrCreateCachedFullCustomer] insert customer duplicate key error`,
				);
				fullCustomer = await CusService.getFull({
					db,
					idOrInternalId: customerId,
					orgId: org.id,
					env: env as AppEnv,
					withEntities: true,
					withSubs: true,
					entityId,
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
		setCache = true;

		fullCustomer = await CusService.getFull({
			db,
			idOrInternalId: fullCustomer.id || fullCustomer.internal_id,
			orgId: org.id,
			env: env as AppEnv,
			withEntities: true,
			withSubs: true,
			entityId,
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
			setCache = true;
			await deleteCachedFullCustomer({
				customerId: fullCustomer.id || fullCustomer.internal_id,
				ctx,
				source: "getOrCreateCachedFullCustomer",
			});
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
	if (!skipCache && setCache) {
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
