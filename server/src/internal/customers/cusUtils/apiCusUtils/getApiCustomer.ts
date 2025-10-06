import {
	AffectedResource,
	ApiCustomerSchema,
	applyResponseVersionChanges,
	type FullCustomer,
} from "@autumn/shared";
import type { RequestContext } from "@/honoUtils/HonoEnv.js";
import { getApiCusFeatures } from "./getApiCusFeature/getApiCusFeatures.js";

export const getApiCustomer = async ({
	ctx,
	fullCus,
}: {
	ctx: RequestContext;
	fullCus: FullCustomer;
}) => {
	const apiCusFeatures = await getApiCusFeatures({
		ctx,
		fullCus,
	});

	const apiCustomer = ApiCustomerSchema.parse({
		id: fullCus.id || null,
		created_at: fullCus.created_at,
		name: fullCus.name || null,
		email: fullCus.email || null,
		fingerprint: fullCus.fingerprint || null,

		stripe_id: fullCus.processor?.id || null,
		env: fullCus.env,

		products: [],
		features: apiCusFeatures,

		// invoices: z.array(APIInvoiceSchema).optional(),
		// trials_used: z.array(APITrialsUsedSchema).optional(),

		// rewards: APICusRewardsSchema.nullish(),
		// metadata: z.record(z.any(), z.any()).default({}),
		// entities: z.array(EntityResponseSchema).optional(),
		// referrals: z.array(APICusReferralSchema).optional(),
		// upcoming_invoice: APICusUpcomingInvoiceSchema.nullish(),
		// payment_method: z.any().nullish(),
	});

	return applyResponseVersionChanges({
		input: apiCustomer,
		targetVersion: ctx.apiVersion,
		resource: AffectedResource.Customer,
	});
};
