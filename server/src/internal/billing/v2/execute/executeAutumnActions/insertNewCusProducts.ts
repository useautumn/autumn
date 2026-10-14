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

	await CusProductService.insert({
		db: ctx.db,
		data: customerProducts,
	});

	await CusEntService.insert({
		ctx,
		data: cusEnts,
	});

	await CusPriceService.insert({
		db: ctx.db,
		data: cusPrices,
	});

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

export const insertNewCusProducts = async ({
	ctx,
	newCusProducts,
}: {
	ctx: AutumnContext;
	newCusProducts: FullCusProduct[];
}) => {
	await insertCustomerProductRows({ ctx, customerProducts: newCusProducts });
	await insertCustomerLicensePools({
		ctx,
		customerLicenses: newCusProducts.flatMap(
			(customerProduct) => customerProduct.customer_licenses ?? [],
		),
	});
};
