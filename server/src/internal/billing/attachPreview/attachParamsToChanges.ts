import {
	type CheckoutChange,
	CusExpand,
	cusProductToProduct,
	type FullCusProduct,
	type FullProduct,
	isPrepaidPrice,
	orgToCurrency,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { cusProductToBalances } from "@/internal/customers/cusUtils/apiCusUtils/getApiBalance/cusProductToBalances.js";
import { getPlanResponse } from "@/internal/products/productUtils/productResponseUtils/getPlanResponse.js";
import type { AttachParams } from "../../customers/cusProducts/AttachParams.js";

/**
 * Convert cusProduct.options to feature_quantities with actual quantities
 * (multiplied by billingUnits for prepaid features)
 */
function cusProductToFeatureQuantities({
	cusProduct,
}: {
	cusProduct: FullCusProduct;
}) {
	return cusProduct.options.map((option) => {
		const cusPrice = cusProduct.customer_prices.find((cp) => {
			const cusEnt = cusProduct.customer_entitlements.find(
				(ce) =>
					ce.internal_feature_id === option.internal_feature_id ||
					ce.entitlement.feature_id === option.feature_id,
			);
			return (
				cusEnt &&
				cp.price.config.internal_feature_id ===
					cusEnt.entitlement.internal_feature_id
			);
		});

		let quantity = option.quantity;

		if (cusPrice && isPrepaidPrice(cusPrice.price)) {
			const billingUnits = cusPrice.price.config.billing_units ?? 1;
			quantity = option.quantity * billingUnits;
		}

		return {
			feature_id: option.feature_id,
			quantity,
		};
	});
}

/**
 * Build incoming change from the new product being attached
 */
async function buildIncomingChange({
	ctx,
	attachParams,
	newProduct,
}: {
	ctx: AutumnContext;
	attachParams: AttachParams;
	newProduct: FullProduct;
}): Promise<CheckoutChange> {
	const currency = orgToCurrency({ org: ctx.org });

	const plan = await getPlanResponse({
		product: newProduct,
		features: ctx.features,
		fullCus: attachParams.customer,
		currency,
		expand: [CusExpand.PlanFeaturesFeature],
	});

	// Build feature quantities from attach options
	const featureQuantities = attachParams.optionsList.map((option) => ({
		feature_id: option.feature_id,
		quantity: option.quantity,
	}));

	return {
		plan,
		feature_quantities: featureQuantities,
		balances: {},
	};
}

/**
 * Build outgoing change from the current product being replaced
 */
async function buildOutgoingChange({
	ctx,
	attachParams,
	curCusProduct,
}: {
	ctx: AutumnContext;
	attachParams: AttachParams;
	curCusProduct: FullCusProduct;
}): Promise<CheckoutChange> {
	const currency = orgToCurrency({ org: ctx.org });
	const fullProduct = cusProductToProduct({ cusProduct: curCusProduct });

	const plan = await getPlanResponse({
		product: fullProduct,
		features: ctx.features,
		fullCus: attachParams.customer,
		currency,
		expand: [CusExpand.PlanFeaturesFeature],
	});

	const balances = cusProductToBalances({
		ctx,
		cusProduct: curCusProduct,
		fullCustomer: attachParams.customer,
	});

	const featureQuantities = cusProductToFeatureQuantities({
		cusProduct: curCusProduct,
	});

	return {
		plan,
		feature_quantities: featureQuantities,
		balances,
	};
}

/**
 * Convert attach params to incoming and outgoing CheckoutChange arrays.
 * Incoming = product being attached, Outgoing = product being replaced (if any).
 */
export const attachParamsToChanges = async ({
	ctx,
	attachParams,
	curCusProduct,
}: {
	ctx: AutumnContext;
	attachParams: AttachParams;
	curCusProduct?: FullCusProduct;
}): Promise<{ incoming: CheckoutChange[]; outgoing: CheckoutChange[] }> => {
	const incoming: CheckoutChange[] = [];
	const outgoing: CheckoutChange[] = [];

	// Build new product from attach params
	const newProduct: FullProduct = {
		...attachParams.products[0],
		prices: attachParams.prices,
		entitlements: attachParams.entitlements,
		free_trial: attachParams.freeTrial,
	};

	// Always add incoming (the new product being attached)
	const incomingChange = await buildIncomingChange({
		ctx,
		attachParams,
		newProduct,
	});
	incoming.push(incomingChange);

	// Add outgoing if there's a current product being replaced
	if (curCusProduct) {
		const outgoingChange = await buildOutgoingChange({
			ctx,
			attachParams,
			curCusProduct,
		});
		outgoing.push(outgoingChange);
	}

	return { incoming, outgoing };
};
