import type {
	FullCusProduct,
	FullCustomer,
	InitFullCusProductContext,
	InitFullCusProductOptions,
} from "@autumn/shared";
import type { AutumnContext } from "@server/honoUtils/HonoEnv";
import { generateId } from "@/utils/genUtils";
import { initCusEntitlement } from "./initCusEntitlementV2/initCusEntitlement";
import { initCusPrice } from "./initCusPrice";
import { initCusProduct } from "./initCusProduct";

export const initFullCusProduct = async ({
	ctx,
	fullCus,
	insertContext,
	insertOptions,
}: {
	ctx: AutumnContext;
	fullCus: FullCustomer;
	insertContext: InitFullCusProductContext;
	insertOptions?: InitFullCusProductOptions;
}): Promise<FullCusProduct> => {
	const { product } = insertContext;

	const cusProductId = generateId("cus_prod");

	const newFullCusEnts = product.entitlements.map((entitlement) => ({
		...initCusEntitlement({
			insertContext,
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

	// TODO: Add existing usage to customer entitlements

	// TODO: Add rollovers to customer entitlements

	const newCusProduct = initCusProduct({
		insertContext,
		cusProductId,
	});

	ctx.logger.info(
		`[insertFullCusProduct] inserting new cus product ${product.id}`,
	);

	const { entitlements: _ents, prices: _prices, ...rawProduct } = product;
	return {
		...newCusProduct,
		product: rawProduct,
		customer_entitlements: newFullCusEnts,
		customer_prices: newCusPrices,
	};

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
