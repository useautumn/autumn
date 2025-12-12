import {
	type Customer,
	cusProductToEnts,
	cusProductToPrices,
	cusProductToProduct,
	type Entity,
	type FeatureOptions,
	type FreeTrial,
	type FullCusProduct,
	type FullCustomer,
	type FullProduct,
	type FullRewardProgram,
} from "@autumn/shared";
import type Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import type {
	AttachParams,
	InsertCusProductParams,
} from "@/internal/customers/cusProducts/AttachParams.js";
import { newCusToFullCus } from "@/internal/customers/cusUtils/cusUtils.js";
import type { ExtendedRequest } from "@/utils/models/Request.js";
import type { AutumnContext } from "../../../../../honoUtils/HonoEnv";

export const webhookToAttachParams = ({
	req,
	stripeCli,
	paymentMethod,
	cusProduct,
	fullCus,
	entities,
}: {
	req: ExtendedRequest;
	stripeCli: Stripe;
	paymentMethod?: Stripe.PaymentMethod | null;
	cusProduct: FullCusProduct;
	fullCus: FullCustomer;
	entities?: Entity[];
}): AttachParams => {
	const fullProduct = cusProductToProduct({ cusProduct });

	const params: AttachParams = {
		stripeCli,
		paymentMethod,
		customer: fullCus,
		org: req.org,
		products: [fullProduct],
		prices: cusProductToPrices({ cusProduct }),
		entitlements: cusProductToEnts({ cusProduct }),
		features: req.features,
		freeTrial: cusProduct.free_trial || null,
		optionsList: cusProduct.options,
		cusProducts: [cusProduct],

		internalEntityId: cusProduct.internal_entity_id || undefined,
		entities: entities || [],
		replaceables: [],
	};

	return params;
};

export const productToInsertParams = ({
	ctx,
	fullCus,
	newProduct,
	entities,
}: {
	ctx: AutumnContext;
	fullCus: FullCustomer;
	newProduct: FullProduct;
	entities?: Entity[];
}): InsertCusProductParams => {
	const { org, features } = ctx;
	const params: InsertCusProductParams = {
		customer: fullCus,
		org,
		product: newProduct,
		prices: newProduct.prices,
		entitlements: newProduct.entitlements,
		features,
		cusProducts: fullCus.customer_products,
		freeTrial: null,
		optionsList: [],
		internalEntityId: undefined,
		entities: entities || [],
		replaceables: [],
	};

	return params;
};

export const newCusToAttachParams = ({
	ctx,
	newCus,
	products,
	stripeCli,
	freeTrial = null,
	optionsList = [],
}: {
	ctx: AutumnContext;
	newCus: FullCustomer;
	products: FullProduct[];
	stripeCli: Stripe;
	freeTrial?: FreeTrial | null;
	optionsList?: FeatureOptions[];
}) => {
	const { org } = ctx;
	if (!newCus.customer_products) {
		newCus.customer_products = [];
	}

	if (!newCus.entities) {
		newCus.entities = [];
	}

	// isDefaultTrial
	const isDefaultTrial = freeTrial && !freeTrial.card_required;
	const attachParams: AttachParams = {
		stripeCli,
		paymentMethod: null,
		req: ctx,
		org,
		customer: newCus,
		products,
		prices: products.flatMap((p) => p.prices),
		entitlements: products.flatMap((p) => p.entitlements),
		freeTrial,
		replaceables: [],
		optionsList: optionsList || [],
		cusProducts: [],
		entities: [],
		features: [],
		invoiceOnly: !isDefaultTrial,
	};
	return attachParams;
};

export const newCusToInsertParams = ({
	ctx,
	newCus,
	product,
	freeTrial = null,
}: {
	ctx: AutumnContext;
	newCus: Customer;
	product: FullProduct;
	freeTrial?: FreeTrial | null;
}) => {
	const { org } = ctx;
	return {
		req: ctx,
		org,
		customer: newCusToFullCus({ newCus }),
		product,
		prices: product.prices,
		entitlements: product.entitlements,
		replaceables: [],
		freeTrial,
		optionsList: [],
		cusProducts: [],
		entities: [],
		features: [],
	} satisfies InsertCusProductParams;
};

export const rewardProgramToAttachParams = ({
	ctx,
	rewardProgram,
	customer,
	product,
}: {
	ctx: AutumnContext;
	rewardProgram: FullRewardProgram;
	customer: FullCustomer;
	product: FullProduct;
}): AttachParams => {
	const { org, env, features } = ctx;

	const reward = rewardProgram.reward;

	return {
		req: ctx,
		org,
		customer,
		products: [product],
		prices: product.prices,
		entitlements: product.entitlements,
		freeTrial: null,
		rewards: [reward],
		optionsList: [],
		cusProducts: customer.customer_products,
		entities: [],
		features,
		stripeCli: createStripeCli({ org, env }),
		paymentMethod: null,
		replaceables: [],
	} satisfies AttachParams;
};
