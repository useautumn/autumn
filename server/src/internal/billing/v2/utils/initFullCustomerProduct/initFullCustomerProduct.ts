import {
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
	// biome-ignore lint/correctness/noUnusedFunctionParameters: will need it at some point
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
	};

	// Finally, apply existing usages to new cus product
	applyExistingUsages({
		customerProduct: newFullCustomerProduct,
		existingUsages: initContext.existingUsages,
		entities: fullCustomer.entities,
	});

	// TODO: Add rollovers to customer entitlements
	applyExistingRollovers({
		customerProduct: newFullCustomerProduct,
		existingRollovers: initContext.existingRollovers ?? [],
	});

	return newFullCustomerProduct;
};
