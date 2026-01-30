import {
	addToExpand,
	type BillingContext,
	type BillingPeriod,
	type BillingPlan,
	type CheckoutChange,
	CusExpand,
	type FullCusProduct,
	isPrepaidPrice,
	type LineItem,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { cusProductToBalances } from "@/internal/customers/cusUtils/apiCusUtils/getApiBalance/cusProductToBalances.js";
import { getApiSubscriptionForCheckout } from "./getApiSubscriptionForCheckout.js";

/**
 * Convert cusProduct.options to feature_quantities with actual quantities
 * (multiplied by billingUnits for prepaid features)
 */
function cusProductToFeatureQuantities({
	cusProduct,
}: {
	cusProduct: FullCusProduct;
}) {
	return cusProduct.options.map((option) => {
		// Find the price for this feature to get billing units
		const cusPrice = cusProduct.customer_prices.find((cp) => {
			const cusEnt = cusProduct.customer_entitlements.find(
				(ce) =>
					ce.internal_feature_id === option.internal_feature_id ||
					ce.entitlement.feature_id === option.feature_id,
			);
			return (
				cusEnt &&
				cp.price.config.internal_feature_id ===
					cusEnt.entitlement.internal_feature_id
			);
		});

		let quantity = option.quantity;

		// For prepaid prices, multiply by billing units to get actual quantity
		if (cusPrice && isPrepaidPrice(cusPrice.price)) {
			const billingUnits = cusPrice.price.config.billing_units ?? 1;
			quantity = option.quantity * billingUnits;
		}

		return {
			feature_id: option.feature_id,
			quantity,
		};
	});
}

/**
 * Get billing period for a specific product from line items.
 */
function getBillingPeriodForProduct({
	lineItems,
	productId,
}: {
	lineItems: LineItem[];
	productId: string;
}): BillingPeriod | undefined {
	const lineItem = lineItems.find(
		(line) =>
			line.context.product.id === productId && line.context.billingPeriod,
	);
	return lineItem?.context.billingPeriod;
}

/**
 * Convert a BillingPlan into incoming and outgoing CheckoutChange arrays.
 * Incoming = products being added, Outgoing = products being canceled/expired/deleted.
 */
export const billingPlanToChanges = async ({
	ctx,
	billingContext,
	billingPlan,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	billingPlan: BillingPlan;
}): Promise<{ incoming: CheckoutChange[]; outgoing: CheckoutChange[] }> => {
	const incoming: CheckoutChange[] = [];
	const outgoing: CheckoutChange[] = [];
	const { autumn } = billingPlan;
	const { fullCustomer } = billingContext;
	const ctxWithExpand = addToExpand({
		ctx,
		add: [CusExpand.SubscriptionsPlan],
	});

	const lineItems = autumn.lineItems ?? [];

	// 1. Products being added (incoming)
	for (const cusProduct of autumn.insertCustomerProducts) {
		const subscription = await getApiSubscriptionForCheckout({
			ctx: ctxWithExpand,
			cusProduct,
			billingContext,
		});

		const balances = cusProductToBalances({
			ctx,
			cusProduct,
			fullCustomer,
		});

		const billingPeriod = getBillingPeriodForProduct({
			lineItems,
			productId: cusProduct.product.id,
		});

		incoming.push({
			plan: subscription.plan,
			balances,
			feature_quantities: cusProductToFeatureQuantities({ cusProduct }),
			period_start: billingPeriod?.start,
			period_end: billingPeriod?.end,
		});
	}

	// 2. Products being canceled/expired (outgoing)
	if (autumn.updateCustomerProduct) {
		const { customerProduct, updates } = autumn.updateCustomerProduct;

		if (updates.canceled || updates.ended_at) {
			const subscription = await getApiSubscriptionForCheckout({
				ctx,
				cusProduct: customerProduct,
				billingContext,
			});

			const balances = cusProductToBalances({
				ctx,
				cusProduct: customerProduct,
				fullCustomer,
			});

			const billingPeriod = getBillingPeriodForProduct({
				lineItems,
				productId: customerProduct.product.id,
			});

			outgoing.push({
				plan: subscription.plan,
				feature_quantities: cusProductToFeatureQuantities({
					cusProduct: customerProduct,
				}),
				balances,
				period_start: billingPeriod?.start,
				period_end: billingPeriod?.end,
			});
		}
	}

	// 3. Scheduled products being deleted (outgoing)
	if (autumn.deleteCustomerProduct) {
		const cusProduct = autumn.deleteCustomerProduct;

		const subscription = await getApiSubscriptionForCheckout({
			ctx,
			cusProduct,
			billingContext,
		});

		const balances = cusProductToBalances({
			ctx,
			cusProduct,
			fullCustomer,
		});

		const billingPeriod = getBillingPeriodForProduct({
			lineItems,
			productId: cusProduct.product.id,
		});

		outgoing.push({
			plan: subscription.plan,
			feature_quantities: cusProductToFeatureQuantities({ cusProduct }),
			balances,
			period_start: billingPeriod?.start,
			period_end: billingPeriod?.end,
		});
	}

	return { incoming, outgoing };
};
