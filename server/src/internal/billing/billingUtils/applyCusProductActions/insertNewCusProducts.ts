import type { FullCusProduct } from "@autumn/shared";
import type { AutumnContext } from "../../../../honoUtils/HonoEnv";
import { CusProductService } from "../../../customers/cusProducts/CusProductService";
import { CusEntService } from "../../../customers/cusProducts/cusEnts/CusEntitlementService";
import { RolloverService } from "../../../customers/cusProducts/cusEnts/cusRollovers/RolloverService";
import { CusPriceService } from "../../../customers/cusProducts/cusPrices/CusPriceService";

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
		db: ctx.db,
		data: cusEnts,
	});

	// 3. Insert cusPrices
	await CusPriceService.insert({
		db: ctx.db,
		data: cusPrices,
	});

	// 1. Insert rollovers
	for (const cusEnt of cusEnts) {
		await RolloverService.insert({
			db: ctx.db,
			rows: cusEnt.rollovers,
			fullCusEnt: cusEnt,
		});
	}
};
