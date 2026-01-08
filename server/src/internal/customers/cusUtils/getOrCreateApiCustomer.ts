import {
	ApiBaseEntitySchema,
	type ApiCustomer,
	type Customer,
	type CustomerData,
	type CustomerLegacyData,
	CustomerNotFoundError,
	type EntityData,
} from "@autumn/shared";
import type { AutumnContext } from "../../../honoUtils/HonoEnv.js";
import { autoCreateEntity } from "../../entities/handlers/handleCreateEntity/autoCreateEntity.js";
import { CusService } from "../CusService.js";
import { handleCreateCustomer } from "../handlers/handleCreateCustomer.js";
import { getApiCustomerBase } from "./apiCusUtils/getApiCustomerBase.js";
import { deleteCachedFullCustomer } from "./fullCustomerCacheUtils/deleteCachedFullCustomer.js";
import { getOrSetCachedFullCustomer } from "./fullCustomerCacheUtils/getOrSetCachedFullCustomer.js";
import { updateCustomerDetails } from "./cusUtils.js";

export const getOrCreateApiCustomer = async ({
	ctx,
	customerId,
	customerData,
	entityId,
	entityData,
}: {
	ctx: AutumnContext;
	customerId: string | null;
	customerData?: CustomerData;
	entityId?: string;
	entityData?: EntityData;
}): Promise<{ apiCustomer: ApiCustomer; legacyData?: CustomerLegacyData }> => {
	// ========================================
	// Phase 1: Get or Create Customer
	// ========================================
	let apiCustomer: ApiCustomer;
	let legacyData: CustomerLegacyData | undefined;

	// Path A: customerId is NULL - always create new customer
	if (!customerId) {
		const newCustomer = await handleCreateCustomer({
			ctx,
			cusData: {
				id: null,
				name: customerData?.name,
				email: customerData?.email,
				fingerprint: customerData?.fingerprint,
				metadata: customerData?.metadata || {},
				stripe_id: customerData?.stripe_id,
			},
			createDefaultProducts: customerData?.disable_default !== true,
		});

		const fullCus = await getOrSetCachedFullCustomer({
			ctx,
			customerId: newCustomer.id || newCustomer.internal_id,
			source: "getOrCreateApiCustomer",
		});
		const res = await getApiCustomerBase({ ctx, fullCus });
		apiCustomer = res.apiCustomer;
		legacyData = res.legacyData;
	}
	// Path B: customerId is NOT NULL - try to get, create if not found
	else {
		// Try to get existing customer from cache/DB
		let apiCustomerOrUndefined: ApiCustomer | undefined;

		try {
			const fullCus = await getOrSetCachedFullCustomer({
				ctx,
				customerId,
				source: "getOrCreateApiCustomer",
			});
			const res = await getApiCustomerBase({ ctx, fullCus });
			apiCustomerOrUndefined = res.apiCustomer;
			legacyData = res.legacyData;
		} catch (_error) {
			if (_error instanceof CustomerNotFoundError) {
				// Customer doesn't exist yet
			} else {
				throw _error;
			}
		}

		// If customer not found, create it
		if (!apiCustomerOrUndefined) {
			// Race conditions are now handled gracefully at the DB level with ON CONFLICT
			let newCustomer: Customer | undefined;
			try {
				newCustomer = await handleCreateCustomer({
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
				});

				newCustomer = await CusService.getFull({
					db: ctx.db,
					idOrInternalId: customerId,
					orgId: ctx.org.id,
					env: ctx.env,
				});
			} catch (error) {
				if (
					error instanceof Error &&
					error.message.includes(
						"duplicate key value violates unique constraint",
					) &&
					customerId
				) {
					ctx.logger.info(
						`[getOrCreateApiCustomer] Customer ${customerId} already exists, fetching existing customer`,
					);

					const existingCustomer = await CusService.getFull({
						db: ctx.db,
						idOrInternalId: customerId,
						orgId: ctx.org.id,
						env: ctx.env,
					});

					// Race condition, don't set in cache
					ctx.skipCache = true;

					if (existingCustomer) newCustomer = existingCustomer;
				} else {
					throw error;
				}
			}

			const fullCus = await getOrSetCachedFullCustomer({
				ctx,
				customerId: newCustomer?.id || newCustomer?.internal_id || "",
				source: "getOrCreateApiCustomer",
			});
			const res = await getApiCustomerBase({ ctx, fullCus });
			apiCustomerOrUndefined = res.apiCustomer;
			legacyData = res.legacyData;
		}

		apiCustomer = apiCustomerOrUndefined;
	}

	// ========================================
	// Phase 2: Update Customer Details
	// ========================================
	const updated = await updateCustomerDetails({
		ctx,
		customer: apiCustomer,
		customerData,
	});

	// If updated, invalidate cache and get the latest ApiCustomer
	if (updated) {
		await deleteCachedFullCustomer({
			customerId: apiCustomer.id || "",
			orgId: ctx.org.id,
			env: ctx.env,
			source: "getOrCreateApiCustomer",
		});
		const fullCus = await getOrSetCachedFullCustomer({
			ctx,
			customerId: apiCustomer.id || "",
			source: "getOrCreateApiCustomer",
		});
		const res = await getApiCustomerBase({ ctx, fullCus });
		apiCustomer = res.apiCustomer;
		legacyData = res.legacyData;
	}

	// AUTO CREATE ENTITY

	if (
		entityId &&
		customerId &&
		!apiCustomer.entities?.some((e) => e.id === entityId)
	) {
		ctx.logger.info(
			`[getOrCreateApiCustomer] Auto creating entity ${entityId} for customer ${customerId}`,
		);

		const newEntity = await autoCreateEntity({
			ctx,
			customerId: customerId || "",
			entityId,
			entityData: {
				name: entityData?.name,
				feature_id: entityData?.feature_id || "",
			},
		});

		await deleteCachedFullCustomer({
			customerId,
			orgId: ctx.org.id,
			env: ctx.env,
			source: "getOrCreateApiCustomer",
		});

		// Warm up the cache
		await getOrSetCachedFullCustomer({
			ctx,
			customerId,
			source: "getOrCreateApiCustomer",
		});

		const apiEntity = ApiBaseEntitySchema.parse(newEntity);
		apiCustomer.entities = [...(apiCustomer.entities || []), apiEntity];
	}

	return {
		apiCustomer,
		legacyData,
	};
};
