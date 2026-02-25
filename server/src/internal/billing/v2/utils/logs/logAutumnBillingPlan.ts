import type { AutumnBillingPlan, BillingContext } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { getTrialStateTransition } from "@/internal/billing/v2/utils/billingContext/getTrialStateTransition";
import { addToExtraLogs } from "@/utils/logging/addToExtraLogs";

export const logAutumnBillingPlan = ({
	ctx,
	plan,
	billingContext,
}: {
	ctx: AutumnContext;
	plan: AutumnBillingPlan;
	billingContext: BillingContext;
}) => {
	const { isTrialing, willBeTrialing } = getTrialStateTransition({
		billingContext,
	});

	const formatCustomerProduct = (cp: {
		product_id: string;
		product: { name: string };
	}) => `${cp.product.name} (${cp.product_id})`;

	addToExtraLogs({
		ctx,
		extras: {
			autumnBillingPlan: {
				insertCustomerProducts:
					plan.insertCustomerProducts.map(formatCustomerProduct).join(", ") ||
					"none",

				updateCustomerProduct: plan.updateCustomerProduct
					? {
							product: formatCustomerProduct(
								plan.updateCustomerProduct.customerProduct,
							),
							updates: plan.updateCustomerProduct.updates,
						}
					: "none",

				deleteCustomerProduct: plan.deleteCustomerProduct
					? formatCustomerProduct(plan.deleteCustomerProduct)
					: "none",

				trialTransition: `${isTrialing ? "trialing" : "not trialing"} -> ${willBeTrialing ? "will trial" : "no trial"}`,

				updateCustomerEntitlements:
					plan.updateCustomerEntitlements
						?.map((update) => {
							if (update.updates) {
								return `${update.customerEntitlement.feature_id}: ${JSON.stringify(update.updates)}`;
							}

							return `${update.customerEntitlement.feature_id}: ${(update.balanceChange ?? 0) > 0 ? "+" : ""}${update.balanceChange}`;
						})
						.join(", ") || "none",

				lineItems:
					plan.lineItems?.map(
						(item) => `${item.description}: ${item.amountAfterDiscounts}`,
					) ?? "none",
			},
		},
	});
};
