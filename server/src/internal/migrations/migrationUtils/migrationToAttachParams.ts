import type { FullCusProduct, FullCustomer, FullProduct } from "@autumn/shared";
import type Stripe from "stripe";
import { getStripeCusData } from "@/internal/customers/attach/attachUtils/attachParams/attachParamsUtils/getStripeCusData.js";
import type { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import type { ExtendedRequest } from "@/utils/models/Request.js";
import type { AutumnContext } from "../../../honoUtils/HonoEnv";

export const migrationToAttachParams = async ({
	req,
	stripeCli,
	customer,
	cusProduct,
	newProduct,
}: {
	req: ExtendedRequest;
	stripeCli: Stripe;
	customer: FullCustomer;
	cusProduct: FullCusProduct;
	newProduct: FullProduct;
}): Promise<AttachParams> => {
	const ctx = req as unknown as AutumnContext;

	const { org, logger } = req;
	const internalEntityId = cusProduct.internal_entity_id || undefined;

	const { stripeCus, paymentMethod, now } = await getStripeCusData({
		ctx,
		customer,
		allowNoStripe: true,
	});

	const attachParams: AttachParams = {
		stripeCli,
		stripeCus,
		now,
		paymentMethod,

		customer,
		products: [newProduct],
		optionsList: cusProduct.options,
		prices: newProduct.prices,
		entitlements: newProduct.entitlements,
		freeTrial: newProduct.free_trial || null,
		replaceables: [],

		req: ctx,
		org,
		entities: customer.entities,
		features: ctx.features,
		internalEntityId,
		cusProducts: customer.customer_products,

		// Others
		apiVersion: cusProduct.api_semver || undefined,
	};

	return attachParams;
};
