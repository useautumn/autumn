import {
	type ApiCustomer,
	type CustomerData,
	CustomerNotFoundError,
} from "@autumn/shared";
import type { AutumnContext } from "../../../honoUtils/HonoEnv.js";
import type { ExtendedRequest } from "../../../utils/models/Request.js";
import { handleCreateCustomer } from "../handlers/handleCreateCustomer.js";
import { getCachedApiCustomer } from "./apiCusCacheUtils/getCachedApiCustomer.js";
import { updateCustomerDetails } from "./cusUtils.js";

export const getOrCreateApiCustomer = async ({
	ctx,
	customerId,
	customerData,
	withAutumnId = false,
}: {
	ctx: AutumnContext;
	customerId: string | null;
	customerData?: CustomerData;
	withAutumnId?: boolean;
}): Promise<ApiCustomer> => {
	// ========================================
	// Phase 1: Get or Create Customer
	// ========================================
	let apiCustomer: ApiCustomer;

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

		const { apiCustomer: createdApiCustomer } = await getCachedApiCustomer({
			ctx,
			customerId: newCustomer.id || newCustomer.internal_id,
			withAutumnId,
		});
		apiCustomer = createdApiCustomer;
	}
	// Path B: customerId is NOT NULL - try to get, create if not found
	else {
		// Try to get existing customer from cache/DB
		let apiCustomerOrUndefined: ApiCustomer | undefined;

		try {
			const { apiCustomer: existingApiCustomer } = await getCachedApiCustomer({
				ctx,
				customerId,
				withAutumnId,
			});
			apiCustomerOrUndefined = existingApiCustomer;
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

				const { apiCustomer: createdApiCustomer } = await getCachedApiCustomer({
					ctx,
					customerId: newCustomer.id || newCustomer.internal_id,
					withAutumnId,
				});
				apiCustomerOrUndefined = createdApiCustomer;
			} catch (error: any) {
				// Handle race condition: another request created the customer
				if (error?.data?.code === "23505") {
					const { apiCustomer: racedApiCustomer } = await getCachedApiCustomer({
						ctx,
						customerId,
						withAutumnId,
					});
					apiCustomerOrUndefined = racedApiCustomer;
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
		const { apiCustomer: refreshedApiCustomer } = await getCachedApiCustomer({
			ctx,
			customerId: apiCustomer.id || "",
			withAutumnId,
		});
		apiCustomer = refreshedApiCustomer;
	}

	return apiCustomer;
};
