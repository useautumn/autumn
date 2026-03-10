import {
	type BillingContext,
	type BillingPlan,
	type BillingPreviewChange,
	CusProductStatus,
	cusPriceToCusEnt,
	type FullCusProduct,
	findCusPriceByFeature,
	findFeatureById,
	isPrepaidPrice,
	notNullish,
	scopeExpandForCtx,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { billingPlanToUpdatedCustomerProduct } from "@/internal/billing/v2/utils/billingPlan/billingPlanToUpdatedCustomerProduct";
import { cusProductToBalances } from "@/internal/customers/cusUtils/apiCusUtils/getApiBalance/cusProductToBalances.js";
import { getApiSubscription } from "@/internal/customers/cusUtils/apiCusUtils/getApiSubscription/getApiSubscription.js";

/**
 * Convert cusProduct.options to feature_quantities with actual quantities
 * (multiplied by billingUnits for prepaid features)
 */
function cusProductToFeatureQuantities({
	ctx,
	cusProduct,
}: {
	ctx: AutumnContext;
	cusProduct: FullCusProduct;
}) {
	return cusProduct.options
		.map((option) => {
			const feature = findFeatureById({
				featureId: option.feature_id ?? "",
				features: ctx.features,
				errorOnNotFound: true,
			});
			// Find the price for this feature to get billing units
			const cusPrice = findCusPriceByFeature({
				internalFeatureId: feature.internal_id,
				cusPrices: cusProduct.customer_prices,
			});

			const isPrepaidCusPrice = cusPrice && isPrepaidPrice(cusPrice.price);

			if (!isPrepaidCusPrice) {
				return undefined;
			}

			const paidQuantity = new Decimal(option.quantity)
				.mul(cusPrice.price.config.billing_units ?? 1)
				.toNumber();

			const cusEnt = cusPriceToCusEnt({
				cusPrice,
				cusEnts: cusProduct.customer_entitlements,
			});

			const quantityWithIncludedUsage =
				paidQuantity + (cusEnt?.entitlement.allowance ?? 0);

			return {
				feature_id: option.feature_id,
				quantity: quantityWithIncludedUsage,
			};
		})
		.filter(notNullish);
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
}): Promise<{
	incoming: BillingPreviewChange[];
	outgoing: BillingPreviewChange[];
}> => {
	const incoming: BillingPreviewChange[] = [];
	const outgoing: BillingPreviewChange[] = [];
	const { autumn } = billingPlan;
	const { fullCustomer } = billingContext;

	const incomingCtx = scopeExpandForCtx({
		ctx,
		prefix: "incoming",
	});

	// 1. Products being added (incoming)
	for (const cusProduct of autumn.insertCustomerProducts) {
		const { data: subscription } = await getApiSubscription({
			ctx: incomingCtx,
			cusProduct,
			fullCus: fullCustomer,
		});

		// biome-ignore lint/correctness/noUnusedVariables: Might use this in the future
		const balances = cusProductToBalances({
			ctx: incomingCtx,
			cusProduct,
			fullCustomer,
		});

		incoming.push({
			plan_id: subscription.plan_id,
			plan: subscription.plan,
			feature_quantities: cusProductToFeatureQuantities({
				ctx: incomingCtx,
				cusProduct,
			}),
			expires_at: subscription.expires_at,
		});
	}

	// 2. Products being canceled/expired (outgoing)
	const outgoingCtx = scopeExpandForCtx({
		ctx,
		prefix: "outgoing",
	});

	if (autumn.updateCustomerProduct) {
		const updatedCustomerProduct = billingPlanToUpdatedCustomerProduct({
			autumnBillingPlan: billingPlan.autumn,
		});
		const { updates } = autumn.updateCustomerProduct;

		const isOutgoing =
			updates.canceled ||
			updates.ended_at ||
			updates.status === CusProductStatus.Expired;

		if (!isOutgoing && updatedCustomerProduct && incoming.length === 0) {
			const { data: subscription } = await getApiSubscription({
				ctx: incomingCtx,
				cusProduct: updatedCustomerProduct,
				fullCus: fullCustomer,
			});

			incoming.push({
				plan_id: subscription.plan_id,
				plan: subscription.plan,
				feature_quantities: cusProductToFeatureQuantities({
					ctx: incomingCtx,
					cusProduct: updatedCustomerProduct,
				}),
				expires_at: subscription.expires_at,
			});
		}

		// Include in outgoing if: canceled, has an end date, or being expired (immediate upgrade)
		if (isOutgoing && updatedCustomerProduct) {
			const { data: subscription } = await getApiSubscription({
				ctx: outgoingCtx,
				cusProduct: updatedCustomerProduct,
				fullCus: fullCustomer,
			});

			outgoing.push({
				plan_id: updatedCustomerProduct.product.id,
				plan: subscription.plan,
				feature_quantities: cusProductToFeatureQuantities({
					ctx: outgoingCtx,
					cusProduct: updatedCustomerProduct,
				}),
				expires_at: updatedCustomerProduct.ended_at ?? null,
			});
		}
	}

	return { incoming, outgoing };
};
