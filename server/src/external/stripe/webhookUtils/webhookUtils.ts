import {
	cusProductToEnts,
	cusProductToPrices,
	cusProductToProduct,
	type Entity,
	type FullCusProduct,
	type FullCustomer,
} from "@autumn/shared";
import type Stripe from "stripe";
import type { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import type { AutumnContext } from "../../../honoUtils/HonoEnv";

export const webhookToAttachParams = ({
	ctx,
	stripeCli,
	paymentMethod,
	cusProduct,
	fullCus,
	entities,
}: {
	ctx: AutumnContext;
	stripeCli: Stripe;
	paymentMethod?: Stripe.PaymentMethod | null;
	cusProduct: FullCusProduct;
	fullCus: FullCustomer;
	entities?: Entity[];
}): AttachParams => {
	const fullProduct = cusProductToProduct({ cusProduct });
	const { org, features } = ctx;

	const params: AttachParams = {
		stripeCli,
		paymentMethod,
		customer: fullCus,
		org,
		products: [fullProduct],
		prices: cusProductToPrices({ cusProduct }),
		entitlements: cusProductToEnts({ cusProduct }),
		features,
		freeTrial: cusProduct.free_trial || null,
		optionsList: cusProduct.options,
		cusProducts: [cusProduct],

		internalEntityId: cusProduct.internal_entity_id || undefined,
		entities: entities || [],
		replaceables: [],
	};

	return params;
};
