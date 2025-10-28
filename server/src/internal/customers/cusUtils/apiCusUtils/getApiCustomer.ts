import {
	AffectedResource,
	type ApiCustomer,
	ApiCustomerSchema,
	applyResponseVersionChanges,
	type CustomerLegacyData,
	type FullCustomer,
} from "@autumn/shared";
import { z } from "zod/v4";
import type { RequestContext } from "@/honoUtils/HonoEnv.js";
import { getApiCusFeatures } from "./getApiCusFeature/getApiCusFeatures.js";
import { getApiCusPlans } from "./getApiCusPlan/getApiCusPlans.js";
import { getApiCustomerExpand } from "./getApiCustomerExpand.js";

export const getApiCustomer = async ({
	ctx,
	fullCus,
	withAutumnId = false,
}: {
	ctx: RequestContext;
	fullCus: FullCustomer;
	withAutumnId?: boolean;
}) => {
	const { apiCusFeatures, legacyData: cusFeaturesLegacyData } =
		await getApiCusFeatures({
			ctx,
			fullCus,
		});

	const { apiCusPlans, legacyData: cusProductLegacyData } =
		await getApiCusPlans({
			ctx,
			fullCus,
		});

	const apiCusExpand = await getApiCustomerExpand({
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

		plans: apiCusPlans,

		features: apiCusFeatures,

		...apiCusExpand,
	});

	return applyResponseVersionChanges<ApiCustomer, CustomerLegacyData>({
		input: apiCustomer,
		legacyData: {
			cusProductLegacyData,
			cusFeatureLegacyData: cusFeaturesLegacyData,
		},
		targetVersion: ctx.apiVersion,
		resource: AffectedResource.Customer,
	});
};
