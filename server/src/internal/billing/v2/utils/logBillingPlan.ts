import { formatMs } from "@shared/utils/common/formatUtils/formatUnix";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { BillingPlan } from "@/internal/billing/v2/billingPlan";

export const logBillingPlan = ({
	ctx,
	billingPlan,
}: {
	ctx: AutumnContext;
	billingPlan: BillingPlan;
}) => {
	ctx.logger.info("Billing plan:", {
		autumn: {
			insertCustomerProducts: billingPlan.autumn.insertCustomerProducts.map(
				(cusProduct) => ({
					id: cusProduct.product.id,
					name: cusProduct.product.name,
					description: cusProduct.product.description,
					entitlements: cusProduct.customer_entitlements.map((ce) => ({
						featureName: ce.entitlement.feature.name,
						nextResetAt: formatMs(ce.next_reset_at),
						balance: ce.balance,
					})),

					trialEndsAt: formatMs(cusProduct.trial_ends_at),
				}),
			),
			updateCustomerProduct: billingPlan.autumn.updateCustomerProduct
				? {
						productId: billingPlan.autumn.updateCustomerProduct.product.id,
						options: billingPlan.autumn.updateCustomerProduct.options,
					}
				: undefined,
		},
		stripe: billingPlan.stripe,
	});
};
