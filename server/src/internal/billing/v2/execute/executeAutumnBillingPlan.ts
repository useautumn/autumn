import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { insertNewCusProducts } from "@/internal/billing/v2/execute/executeAutumnActions/insertNewCusProducts";
import { updateCustomerEntitlements } from "@/internal/billing/v2/execute/executeAutumnActions/updateCustomerEntitlements";
import type { AutumnBillingPlan } from "@/internal/billing/v2/types/billingPlan";
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

	await EntitlementService.insert({
		db,
		data: customEntitlements,
	});

	await PriceService.insert({
		db,
		data: customPrices,
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

	// 3. Update customer product options
	if (updateCustomerProduct) {
		await CusProductService.update({
			db,
			cusProductId: updateCustomerProduct.id,
			updates: {
				options: updateCustomerProduct.options,
				status: updateCustomerProduct.status,
			},
		});
	}

	// 4. Update entitlement balances
	await updateCustomerEntitlements({
		ctx,
		updates: autumnBillingPlan.updateCustomerEntitlements,
	});
};
