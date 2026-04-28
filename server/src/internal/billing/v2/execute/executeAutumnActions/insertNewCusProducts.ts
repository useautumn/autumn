import {
	customerProductHasActiveStatus,
	type FullCusProduct,
} from "@autumn/shared";
import type { AutumnContext } from "../../../../../honoUtils/HonoEnv";
import { CusProductService } from "../../../../customers/cusProducts/CusProductService";
import { CusEntService } from "../../../../customers/cusProducts/cusEnts/CusEntitlementService";
import { RolloverService } from "../../../../customers/cusProducts/cusEnts/cusRollovers/RolloverService";
import { CusPriceService } from "../../../../customers/cusProducts/cusPrices/CusPriceService";

export const insertNewCusProducts = async ({
	ctx,
	newCusProducts,
}: {
	ctx: AutumnContext;
	newCusProducts: FullCusProduct[];
}) => {
	const cusEnts = newCusProducts.flatMap(
		(cusProduct) => cusProduct.customer_entitlements,
	);
	const cusPrices = newCusProducts.flatMap(
		(cusProduct) => cusProduct.customer_prices,
	);

	// 4. Insert cusProducts
	await CusProductService.insert({
		db: ctx.db,
		data: newCusProducts,
	});

	// 2. Insert cusEnts
	await CusEntService.insert({
		ctx,
		data: cusEnts,
	});

	// 3. Insert cusPrices
	await CusPriceService.insert({
		db: ctx.db,
		data: cusPrices,
	});

	// 1. Upsert rollovers (use upsert to handle carried-over rollovers from plan switches)
	const rolloverInsertPromises = cusEnts.flatMap((cusEnt) => {
		const cusProduct = newCusProducts.find(
			(cusProduct) => cusProduct.id === cusEnt.customer_product_id,
		);
		if (!customerProductHasActiveStatus(cusProduct)) return [];
		if (cusEnt.rollovers.length === 0) return [];
		return [
			RolloverService.insert({
				ctx,
				rows: cusEnt.rollovers,
				fullCusEnt: { ...cusEnt, customer_product: cusProduct ?? null },
			}),
		];
	});
	await Promise.all(rolloverInsertPromises);
};
