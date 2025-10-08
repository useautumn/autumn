import {
	AffectedResource,
	type ApiCustomer,
	ApiCustomerSchema,
	applyResponseVersionChanges,
	type CusExpand,
	type CustomerLegacyData,
	type FullCustomer,
} from "@autumn/shared";
import { z } from "zod/v4";
import type { RequestContext } from "@/honoUtils/HonoEnv.js";
import { getApiCusFeatures } from "./getApiCusFeature/getApiCusFeatures.js";
import { getApiCusProducts } from "./getApiCusProduct/getApiCusProducts.js";
import { getApiCustomerExpand } from "./getApiCustomerExpand.js";

export const getApiCustomer = async ({
	ctx,
	fullCus,
	expand,
	withAutumnId = false,
}: {
	ctx: RequestContext;
	fullCus: FullCustomer;
	expand: CusExpand[];
	withAutumnId?: boolean;
}) => {
	const apiCusFeatures = await getApiCusFeatures({
		ctx,
		fullCus,
	});

	const { apiCusProducts, legacyData: cusProductLegacyData } =
		await getApiCusProducts({
			ctx,
			fullCus,
		});

	const apiCusExpand = await getApiCustomerExpand({
		ctx,
		fullCus,
		expand,
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
		...apiCusExpand,
	});

	return applyResponseVersionChanges<ApiCustomer, CustomerLegacyData>({
		input: apiCustomer,
		legacyData: {
			cusProductLegacyData,
		},
		targetVersion: ctx.apiVersion,
		resource: AffectedResource.Customer,
	});
};
