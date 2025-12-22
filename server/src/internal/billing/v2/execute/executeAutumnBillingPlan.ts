import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { AutumnBillingPlan } from "@/internal/billing/v2/billingPlan";
import { insertNewCusProducts } from "@/internal/billing/v2/execute/executeAutumnActions/insertNewCusProducts";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import { EntitlementService } from "@/internal/products/entitlements/EntitlementService";
import { FreeTrialService } from "@/internal/products/free-trials/FreeTrialService";
import { PriceService } from "@/internal/products/prices/PriceService";

export const executeAutumnBillingPlan = async ({
	ctx,
	autumnBillingPlan,
}: {
	ctx: AutumnContext;
	autumnBillingPlan: AutumnBillingPlan;
}) => {
	const { db } = ctx;
	const {
		insertCustomerProducts,
		updateCustomerProduct,
		customPrices,
		customEntitlements,
		customFreeTrial,
	} = autumnBillingPlan;

	await PriceService.insert({
		db,
		data: customPrices,
	});

	await EntitlementService.insert({
		db,
		data: customEntitlements,
	});
	if (customFreeTrial) {
		await FreeTrialService.insert({
			db,
			data: customFreeTrial,
		});
	}

	// 2. Insert new customer products
	await insertNewCusProducts({
		ctx,
		newCusProducts: insertCustomerProducts,
	});

	// 3. Update customer product
	if (updateCustomerProduct) {
		await CusProductService.update({
			db,
			cusProductId: updateCustomerProduct.customerProduct.id,
			updates: updateCustomerProduct.updates,
		});
	}
};
