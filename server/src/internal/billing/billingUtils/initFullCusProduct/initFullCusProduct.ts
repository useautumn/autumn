import type {
	FullCusProduct,
	FullCustomer,
	InitFullCusProductContext,
	InitFullCusProductOptions,
} from "@autumn/shared";
import type { AutumnContext } from "@server/honoUtils/HonoEnv";
import { generateId } from "@/utils/genUtils";
import { applyExistingUsages } from "../handleExistingUsages/applyExistingUsages";
import { initCusEntitlement } from "./initCusEntitlementV2/initCusEntitlement";
import { initCusPrice } from "./initCusPrice";
import { initCusProduct } from "./initCusProduct";

export const initFullCusProduct = ({
	ctx,
	fullCus,
	initContext,
	initOptions,
}: {
	ctx: AutumnContext;
	fullCus: FullCustomer;
	initContext: InitFullCusProductContext;
	initOptions?: InitFullCusProductOptions;
}): FullCusProduct => {
	const { product } = initContext;

	const cusProductId = generateId("cus_prod");

	const newFullCusEnts = product.entitlements.map((entitlement) => ({
		...initCusEntitlement({
			initContext,
			entitlement,
			cusProductId,
		}),
		entitlement,
		replaceables: [],
		rollovers: [],
	}));

	const newCusPrices = product.prices.map((price) => ({
		...initCusPrice({
			fullCus,
			price,
			cusProductId,
		}),
		price,
	}));

	const newCusProduct = initCusProduct({
		initContext,
		cusProductId,
	});

	ctx.logger.info(
		`[insertFullCusProduct] inserting new cus product ${product.id}`,
	);

	const { entitlements: _ents, prices: _prices, ...rawProduct } = product;

	const newFullCusProduct = {
		...newCusProduct,
		product: rawProduct,
		customer_entitlements: newFullCusEnts,
		customer_prices: newCusPrices,
	};

	// Finally, apply existing usages to new cus product
	applyExistingUsages({
		cusProduct: newFullCusProduct,
		existingUsages: initContext.existingUsages,
		entities: fullCus.entities,
	});

	// TODO: Add rollovers to customer entitlements

	return newFullCusProduct;

	// await CusProductService.insert({
	// 	db,
	// 	data: newCusProduct,
	// });

	// await Promise.all([
	// 	CusEntService.insert({
	// 		db,
	// 		data: newCusEnts,
	// 	}),
	// 	CusPriceService.insert({
	// 		db,
	// 		data: newCusPrices,
	// 	}),
	// ]);
};
