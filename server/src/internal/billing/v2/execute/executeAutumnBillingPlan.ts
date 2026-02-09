import type { AutumnBillingPlan } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { insertNewCusProducts } from "@/internal/billing/v2/execute/executeAutumnActions/insertNewCusProducts";
import { updateCustomerEntitlements } from "@/internal/billing/v2/execute/executeAutumnActions/updateCustomerEntitlements";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import { InvoiceService } from "@/internal/invoices/InvoiceService";
import { EntitlementService } from "@/internal/products/entitlements/EntitlementService";
import { FreeTrialService } from "@/internal/products/free-trials/FreeTrialService";
import { PriceService } from "@/internal/products/prices/PriceService";
import { SubService } from "@/internal/subscriptions/SubService";

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
		deleteCustomerProduct,
		customPrices,
		customEntitlements,
		customFreeTrial,
	} = autumnBillingPlan;

	if (customEntitlements) {
		await EntitlementService.insert({
			db,
			data: customEntitlements,
		});
	}

	if (customPrices) {
		await PriceService.insert({
			db,
			data: customPrices,
		});
	}

	if (customFreeTrial) {
		await FreeTrialService.insert({
			db,
			data: customFreeTrial,
		});
	}

	// ctx.logger.debug(
	// 	`[execAutumnPlan] inserting new customer products: ${insertCustomerProducts.map((cp) => cp.product.id).join(", ")}`,
	// );
	// 2. Insert new customer products
	await insertNewCusProducts({
		ctx,
		newCusProducts: insertCustomerProducts,
	});

	// 3. Update customer product options
	if (updateCustomerProduct) {
		const { customerProduct, updates } = updateCustomerProduct;

		await CusProductService.update({
			db,
			cusProductId: customerProduct.id,
			updates,
		});
	}

	// 4. Delete scheduled customer product (e.g., when updating while canceling)
	if (deleteCustomerProduct) {
		ctx.logger.debug(
			`[executeAutumnBillingPlan] deleting scheduled customer product: ${deleteCustomerProduct.product.id}`,
		);
		await CusProductService.delete({
			db,
			cusProductId: deleteCustomerProduct.id,
		});
	}

	// 5. Update entitlement balances
	await updateCustomerEntitlements({
		ctx,
		updates: autumnBillingPlan.updateCustomerEntitlements,
	});

	// 6. Upsert subscription (if provided)
	if (autumnBillingPlan.upsertSubscription) {
		await SubService.upsertByStripeId({
			db,
			subscription: autumnBillingPlan.upsertSubscription,
		});
	}

	// 7. Upsert invoice (if provided)
	if (autumnBillingPlan.upsertInvoice) {
		await InvoiceService.upsert({
			db,
			invoice: autumnBillingPlan.upsertInvoice,
		});
	}
};
