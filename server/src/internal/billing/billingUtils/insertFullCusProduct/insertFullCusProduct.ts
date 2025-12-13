import type {
	FullCustomer,
	InsertCusProductOptions,
	InsertFullCusProductContext,
} from "@autumn/shared";
import type { AutumnContext } from "@server/honoUtils/HonoEnv";
import { generateId } from "@/utils/genUtils";
import { CusProductService } from "../../../customers/cusProducts/CusProductService";
import { CusEntService } from "../../../customers/cusProducts/cusEnts/CusEntitlementService";
import { CusPriceService } from "../../../customers/cusProducts/cusPrices/CusPriceService";
import { initCusEntitlement } from "./initCusEntitlementV2/initCusEntitlement";
import { initCusPrice } from "./initCusPrice";
import { initCusProduct } from "./initCusProduct";

export const insertFullCusProduct = async ({
	ctx,
	fullCus,
	insertContext,
	insertOptions,
}: {
	ctx: AutumnContext;
	fullCus: FullCustomer;
	insertContext: InsertFullCusProductContext;
	insertOptions?: InsertCusProductOptions;
}) => {
	const { db } = ctx;
	const { product } = insertContext;

	const cusProductId = generateId("cus_prod");

	const newCusEnts = product.entitlements.map((entitlement) =>
		initCusEntitlement({
			insertContext,
			entitlement,
			cusProductId,
		}),
	);

	const newCusPrices = product.prices.map((price) =>
		initCusPrice({
			fullCus,
			price,
			cusProductId,
		}),
	);

	// TODO: Add existing usage to customer entitlements

	// TODO: Add rollovers to customer entitlements

	const newCusProduct = initCusProduct({
		insertContext,
		cusProductId,
	});

	ctx.logger.info(
		`[insertFullCusProduct] inserting new cus product ${product.id}`,
	);

	await CusProductService.insert({
		db,
		data: newCusProduct,
	});

	await Promise.all([
		CusEntService.insert({
			db,
			data: newCusEnts,
		}),
		CusPriceService.insert({
			db,
			data: newCusPrices,
		}),
	]);
};
