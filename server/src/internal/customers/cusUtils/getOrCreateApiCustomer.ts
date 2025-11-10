import {
	type ApiCustomer,
	ApiEntitySchema,
	type CustomerData,
	type CustomerLegacyData,
	CustomerNotFoundError,
	type EntityData,
} from "@autumn/shared";
import type { AutumnContext } from "../../../honoUtils/HonoEnv.js";
import type { ExtendedRequest } from "../../../utils/models/Request.js";
import { autoCreateEntity } from "../../entities/handlers/handleCreateEntity/autoCreateEntity.js";
import { handleCreateCustomer } from "../handlers/handleCreateCustomer.js";
import { deleteCachedApiCustomer } from "./apiCusCacheUtils/deleteCachedApiCustomer.js";
import { getCachedApiCustomer } from "./apiCusCacheUtils/getCachedApiCustomer.js";
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
			req: ctx as ExtendedRequest,
			cusData: {
				id: null,
				name: customerData?.name,
				email: customerData?.email,
				fingerprint: customerData?.fingerprint,
				metadata: customerData?.metadata || {},
				stripe_id: customerData?.stripe_id,
			},
		});

		const res = await getCachedApiCustomer({
			ctx,
			customerId: newCustomer.id || newCustomer.internal_id,
		});

		apiCustomer = res.apiCustomer;
		legacyData = res.legacyData;
	}
	// Path B: customerId is NOT NULL - try to get, create if not found
	else {
		// Try to get existing customer from cache/DB
		let apiCustomerOrUndefined: ApiCustomer | undefined;

		try {
			const res = await getCachedApiCustomer({
				ctx,
				customerId,
			});
			apiCustomerOrUndefined = res?.apiCustomer;
			legacyData = res?.legacyData;
		} catch (_error) {
			if (_error instanceof CustomerNotFoundError) {
			} else {
				throw _error;
			}
			// Customer doesn't exist yet
		}

		// If customer not found, create it
		if (!apiCustomerOrUndefined) {
			try {
				const newCustomer = await handleCreateCustomer({
					req: ctx as ExtendedRequest,
					cusData: {
						id: customerId,
						name: customerData?.name,
						email: customerData?.email,
						fingerprint: customerData?.fingerprint,
						metadata: customerData?.metadata || {},
						stripe_id: customerData?.stripe_id,
					},
				});

				const res = await getCachedApiCustomer({
					ctx,
					customerId: newCustomer.id || newCustomer.internal_id,
					source: "getOrCreateApiCustomer",
				});
				apiCustomerOrUndefined = res?.apiCustomer;
				legacyData = res?.legacyData;
			} catch (error: any) {
				// Handle race condition: another request created the customer
				if (error?.data?.code === "23505") {
					const res = await getCachedApiCustomer({
						ctx,
						customerId,
					});
					apiCustomerOrUndefined = res?.apiCustomer;
					legacyData = res?.legacyData;
				} else {
					throw error;
				}
			}
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

	// If updated, refresh the cache and get the latest ApiCustomer
	if (updated) {
		const res = await getCachedApiCustomer({
			ctx,
			customerId: apiCustomer.id || "",
		});
		apiCustomer = res?.apiCustomer;
		legacyData = res?.legacyData;
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

		await deleteCachedApiCustomer({
			customerId,
			orgId: ctx.org.id,
			env: ctx.env,
		});

		await getCachedApiCustomer({
			ctx,
			customerId,
		});

		const apiEntity = ApiEntitySchema.parse(newEntity);
		apiCustomer.entities = [...(apiCustomer.entities || []), apiEntity];
	}

	return {
		apiCustomer,
		legacyData,
	};
};
