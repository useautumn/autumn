import type { FullCusProduct, FullCustomer, FullProduct } from "@autumn/shared";
import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getStripeCusData } from "@/internal/customers/attach/attachUtils/attachParams/attachParamsUtils/getStripeCusData.js";
import type { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";

export const migrationToAttachParams = async ({
	ctx,
	stripeCli,
	customer,
	cusProduct,
	newProduct,
}: {
	ctx: AutumnContext;
	stripeCli: Stripe;
	customer: FullCustomer;
	cusProduct: FullCusProduct;
	newProduct: FullProduct;
}): Promise<AttachParams> => {
	const { org, features } = ctx;
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
		features,
		internalEntityId,
		entityId:
			customer.entities?.find((e) => e.internal_id === internalEntityId)?.id ||
			undefined,
		cusProducts: customer.customer_products,

		// Others
		apiVersion: cusProduct.api_semver || undefined,
	};

	return attachParams;
};
