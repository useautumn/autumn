import type {
	FullCusProduct,
	InitFullCustomerProductContext,
	InitFullCustomerProductOptions,
} from "@autumn/shared";
import { applyExistingRollovers } from "@/internal/billing/billingUtils/handleExistingRollovers/applyExistingRollovers";
import { generateId } from "@/utils/genUtils";
import type { AutumnContext } from "../../../../honoUtils/HonoEnv";
import { applyExistingUsages } from "../handleExistingUsages/applyExistingUsages";
import { initCusEntitlement } from "./initCusEntitlementV2/initCusEntitlement";
import { initCusPrice } from "./initCusPrice";
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
		...initCusEntitlement({
			initContext,
			entitlement,
			cusProductId,
		}),
		entitlement,
		replaceables: [],
		rollovers: [],
	}));

	const newCusPrices = fullProduct.prices.map((price) => ({
		...initCusPrice({
			fullCus: fullCustomer,
			price,
			cusProductId,
		}),
		price,
	}));

	const newCusProduct = initCustomerProduct({
		initContext,
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
