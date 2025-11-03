import {
	type ApiCustomer,
	ApiCustomerSchema,
	type FullCustomer,
} from "@autumn/shared";
import { z } from "zod/v4";
import type { RequestContext } from "@/honoUtils/HonoEnv.js";
import { getApiCusFeatures } from "./getApiCusFeature/getApiCusFeatures.js";
import { getApiCusProducts } from "./getApiCusProduct/getApiCusProducts.js";

/**
 * Get base ApiCustomer without expand fields
 * This is the core customer object that can be cached
 */
export const getApiCustomerBase = async ({
	ctx,
	fullCus,
	withAutumnId = false,
}: {
	ctx: RequestContext;
	fullCus: FullCustomer;
	withAutumnId?: boolean;
}): Promise<ApiCustomer> => {
	const apiCusFeatures = await getApiCusFeatures({
		ctx,
		fullCus,
	});

	const { apiCusProducts } = await getApiCusProducts({
		ctx,
		fullCus,
	});

	const apiCustomer = ApiCustomerSchema.extend({
		autumn_id: z.string().optional(),
	}).parse({
		autumn_id: withAutumnId ? fullCus.internal_id : undefined,

		id: fullCus.id || null,
		created_at: fullCus.created_at,
		name: fullCus.name || null,
		email: fullCus.email || null,
		fingerprint: fullCus.fingerprint || null,

		stripe_id: fullCus.processor?.id || null,
		env: fullCus.env,
		metadata: fullCus.metadata,

		products: apiCusProducts,
		features: apiCusFeatures,
	});

	return apiCustomer;
};
