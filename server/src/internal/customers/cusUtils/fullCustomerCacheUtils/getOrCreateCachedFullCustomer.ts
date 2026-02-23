import {
	type AppEnv,
	type CheckParams,
	CustomerExpand,
	type Entity,
	type FullCustomer,
	type TrackParams,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { customerActions } from "@/internal/customers/actions/index.js";
import { autoCreateEntity } from "@/internal/entities/handlers/handleCreateEntity/autoCreateEntity.js";
import { resetCustomerEntitlements } from "../../actions/resetCustomerEntitlements/resetCustomerEntitlements.js";
import { CusService } from "../../CusService.js";
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

			// Lazy reset stale entitlements
			const didReset = await resetCustomerEntitlements({
				fullCus: fullCustomer,
				db,
				org,
				env: env as AppEnv,
			});

			if (didReset) {
				setCache = true;
			} else {
				setCache = false;
			}
		}
	}

	// 2. Try DB if not in cache
	if (!fullCustomer && customerId) {
		fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			withEntities: true,
			withSubs: true,
			expand: [CustomerExpand.Invoices],
			allowNotFound: true,
		});

		// Lazy reset stale entitlements (DB path)
		if (fullCustomer) {
			await resetCustomerEntitlements({
				fullCus: fullCustomer,
				db,
				org,
				env: env as AppEnv,
			});
		}
	}

	// 3. Create if not found
	if (!fullCustomer) {
		fullCustomer = await customerActions.createWithDefaults({
			ctx,
			customerId,
			customerData,
		});
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
			ctx,
			idOrInternalId: fullCustomer.id || fullCustomer.internal_id,
			withEntities: true,
			withSubs: true,
			entityId,
			expand: [CustomerExpand.Invoices],
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
		// Note (to fix): causes race condition when cache isn't set and concurrent track requests each set the cache.
		await setCachedFullCustomer({
			ctx,
			fullCustomer,
			customerId: fullCustomer.id || fullCustomer.internal_id,
			fetchTimeMs,
			source,
			overwrite: true,
		}).catch((err) => logger.error(`Failed to set cache: ${err}`));
	}

	return fullCustomer;
};
