import {
	customerProductHasActiveStatus,
	type FullCusProduct,
} from "@autumn/shared";
import type { AutumnContext } from "../../../../../honoUtils/HonoEnv";
import { CusProductService } from "../../../../customers/cusProducts/CusProductService";
import { CusEntService } from "../../../../customers/cusProducts/cusEnts/CusEntitlementService";
import { RolloverService } from "../../../../customers/cusProducts/cusEnts/cusRollovers/RolloverService";
import { CusPriceService } from "../../../../customers/cusProducts/cusPrices/CusPriceService";
import { insertCustomerLicensePools } from "./insertCustomerLicensePools";

/** A plan's new products with their grants, prices and carried rollovers: the rows the balance worker holds. */
export const insertCustomerProductRows = async ({
	ctx,
	customerProducts,
}: {
	ctx: AutumnContext;
	customerProducts: FullCusProduct[];
}) => {
	const cusEnts = customerProducts.flatMap(
		(cusProduct) => cusProduct.customer_entitlements,
	);
	const cusPrices = customerProducts.flatMap(
		(cusProduct) => cusProduct.customer_prices,
	);

	// 4. Insert cusProducts
	await CusProductService.insert({
		db: ctx.db,
		data: customerProducts,
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
		const cusProduct = customerProducts.find(
			(cusProduct) => cusProduct.id === cusEnt.customer_product_id,
		);
		if (!customerProductHasActiveStatus(cusProduct)) return [];
		if (cusEnt.rollovers.length === 0) return [];
		return [
			RolloverService.insert({
				ctx,
				rows: cusEnt.rollovers,
				// New cusEnt — no pre-existing DB rollovers. Pass [] so the max-cap
				// check in clearExcessRollovers doesn't double-count the rows we're
				// inserting (cusEnt.rollovers already holds the same objects as `rows`).
				fullCusEnt: {
					...cusEnt,
					customer_product: cusProduct ?? null,
					rollovers: [],
				},
			}),
		];
	});
	await Promise.all(rolloverInsertPromises);
};

/** New products and the license pools born with them. */
export const insertNewCusProducts = async ({
	ctx,
	newCusProducts,
}: {
	ctx: AutumnContext;
	newCusProducts: FullCusProduct[];
}) => {
	await insertCustomerProductRows({ ctx, customerProducts: newCusProducts });
	await insertCustomerLicensePools({ ctx, customerProducts: newCusProducts });
};
