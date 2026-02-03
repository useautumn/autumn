import {
	cp,
	type FullCusProduct,
	type InitFullCustomerProductContext,
	type InitFullCustomerProductOptions,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { generateId } from "@/utils/genUtils";
import { applyExistingRollovers } from "../handleExistingRollovers/applyExistingRollovers";
import { applyExistingUsages } from "../handleExistingUsages/applyExistingUsages";
import { initCustomerEntitlement } from "./initCustomerEntitlement/initCustomerEntitlement";
import { initCustomerPrice } from "./initCustomerPrice";
import { initCustomerProduct } from "./initCustomerProduct";

export const initFullCustomerProduct = ({
	ctx,
	initContext,
	initOptions,
}: {
	ctx: AutumnContext;
	initContext: InitFullCustomerProductContext;
	initOptions?: InitFullCustomerProductOptions;
}): FullCusProduct => {
	const { fullCustomer, fullProduct } = initContext;

	const cusProductId = generateId("cus_prod");

	const newFullCusEnts = fullProduct.entitlements.map((entitlement) => ({
		...initCustomerEntitlement({
			initContext,
			initOptions,
			entitlement,
			cusProductId,
		}),
		entitlement,
		replaceables: [],
		rollovers: [],
	}));

	const newCusPrices = fullProduct.prices.map((price) => ({
		...initCustomerPrice({
			fullCus: fullCustomer,
			price,
			cusProductId,
		}),
		price,
	}));

	const newCusProduct = initCustomerProduct({
		initContext,
		initOptions,
		customerProductId: cusProductId,
	});

	const { entitlements: _ents, prices: _prices, ...rawProduct } = fullProduct;

	const newFullCustomerProduct = {
		...newCusProduct,
		product: rawProduct,
		customer_entitlements: newFullCusEnts,
		customer_prices: newCusPrices,
		free_trial: initContext.freeTrial ?? null,
	};

	applyExistingUsages({
		ctx,
		customerProduct: newFullCustomerProduct,
		existingUsages: initContext.existingUsages,
		entities: fullCustomer.entities,
	});

	applyExistingRollovers({
		customerProduct: newFullCustomerProduct,
		existingRollovers: initContext.existingRollovers ?? [],
	});

	const { valid: isPaidRecurring } = cp(newFullCustomerProduct)
		.paid()
		.recurring();

	if (!isPaidRecurring) {
		newFullCustomerProduct.subscription_ids = [];
		newFullCustomerProduct.scheduled_ids = [];
	}

	return newFullCustomerProduct;
};
