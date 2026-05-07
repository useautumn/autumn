import {
	customerProductHasActiveStatus,
	type FullCusProduct,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService";
import { RolloverService } from "@/internal/customers/cusProducts/cusEnts/cusRollovers/RolloverService";
import { CusPriceService } from "@/internal/customers/cusProducts/cusPrices/CusPriceService";
import { applyCustomerProductPatch } from "../../utils/billingPlan/customerProductPlanMutations";

export const executePatchCustomerProducts = async ({
	ctx,
	patchCustomerProducts,
}: {
	ctx: AutumnContext;
	patchCustomerProducts: NonNullable<
		import("@autumn/shared").AutumnBillingPlan["patchCustomerProducts"]
	>;
}) => {
	for (const patchCustomerProduct of patchCustomerProducts) {
		await CusEntService.insert({
			ctx,
			data: patchCustomerProduct.insertCustomerEntitlements,
		});

		await CusPriceService.insert({
			db: ctx.db,
			data: patchCustomerProduct.insertCustomerPrices,
		});

		const finalCustomerProduct = applyCustomerProductPatch({
			customerProduct: patchCustomerProduct.customerProduct,
			patch: patchCustomerProduct,
		});

		await insertPatchRollovers({
			ctx,
			customerProduct: finalCustomerProduct,
			customerEntitlements: patchCustomerProduct.insertCustomerEntitlements,
		});

		for (const customerPrice of patchCustomerProduct.deleteCustomerPrices) {
			await CusPriceService.delete({
				db: ctx.db,
				id: customerPrice.id,
			});
		}

		for (const customerEntitlement of patchCustomerProduct.deleteCustomerEntitlements) {
			await CusEntService.delete({
				db: ctx.db,
				id: customerEntitlement.id,
			});
		}
	}
};

const insertPatchRollovers = async ({
	ctx,
	customerProduct,
	customerEntitlements,
}: {
	ctx: AutumnContext;
	customerProduct: FullCusProduct;
	customerEntitlements: NonNullable<
		import("@autumn/shared").AutumnBillingPlan["patchCustomerProducts"]
	>[number]["insertCustomerEntitlements"];
}) => {
	if (!customerProductHasActiveStatus(customerProduct)) return;

	const rolloverInsertPromises = customerEntitlements.flatMap(
		(customerEntitlement) => {
			if (customerEntitlement.rollovers.length === 0) return [];

			return [
				RolloverService.insert({
					ctx,
					rows: customerEntitlement.rollovers,
					fullCusEnt: {
						...customerEntitlement,
						customer_product: customerProduct,
						rollovers: [],
					},
				}),
			];
		},
	);

	await Promise.all(rolloverInsertPromises);
};
