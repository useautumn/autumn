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
	UpdateSubscriptionIntent,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { billingPlanToUpdatedCustomerProduct } from "@/internal/billing/v2/utils/billingPlan/billingPlanToUpdatedCustomerProduct";
import { cusProductToBalances } from "@/internal/customers/cusUtils/apiCusUtils/getApiBalance/cusProductToBalances.js";
import { getApiSubscription } from "@/internal/customers/cusUtils/apiCusUtils/getApiSubscription/getApiSubscription.js";
import { billingPlanToOutgoingEffectiveAt } from "./billingPlanToEffectiveAt";

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

const getIsOutgoing = ({
	billingContext,
	updates,
}: {
	billingContext: BillingContext;
	updates: {
		canceled?: boolean | null;
		ended_at?: number | null;
		status?: CusProductStatus | null;
	};
}) => {
	if (
		"intent" in billingContext &&
		billingContext.intent === UpdateSubscriptionIntent.UpdateQuantity
	) {
		return true;
	}

	if (billingContext.cancelAction === "uncancel") {
		return true;
	}

	return Boolean(
		updates.canceled ||
			updates.ended_at ||
			updates.status === CusProductStatus.Expired,
	);
};

const getShouldIncludeIncoming = ({
	billingContext,
	isOutgoing,
	incoming,
}: {
	billingContext: BillingContext;
	isOutgoing: boolean;
	incoming: BillingPreviewChange[];
}) => {
	if ("intent" in billingContext) {
		return (
			billingContext.intent === UpdateSubscriptionIntent.UpdateQuantity ||
			billingContext.cancelAction === "uncancel"
		);
	}

	return !isOutgoing && incoming.length === 0;
};

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

	for (const cusProduct of autumn.insertCustomerProducts) {
		const { data: subscription } = await getApiSubscription({
			ctx: incomingCtx,
			cusProduct,
			fullCus: fullCustomer,
		});

		const balances = cusProductToBalances({
			ctx: incomingCtx,
			cusProduct,
			fullCustomer,
		});
		void balances;

		incoming.push({
			plan_id: subscription.plan_id,
			plan: subscription.plan,
			feature_quantities: cusProductToFeatureQuantities({
				ctx: incomingCtx,
				cusProduct,
			}),
			effective_at: null,
		});
	}

	const outgoingCtx = scopeExpandForCtx({
		ctx,
		prefix: "outgoing",
	});

	if (autumn.updateCustomerProduct) {
		const updatedCustomerProduct = billingPlanToUpdatedCustomerProduct({
			autumnBillingPlan: billingPlan.autumn,
		});
		const { updates } = autumn.updateCustomerProduct;

		const isOutgoing = getIsOutgoing({
			billingContext,
			updates,
		});
		const shouldIncludeIncoming = getShouldIncludeIncoming({
			billingContext,
			isOutgoing,
			incoming,
		});

		if (shouldIncludeIncoming && updatedCustomerProduct) {
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
				effective_at: null,
			});
		}

		const outgoingCustomerProduct =
			autumn.updateCustomerProduct.customerProduct;

		if (isOutgoing && outgoingCustomerProduct) {
			const { data: subscription } = await getApiSubscription({
				ctx: outgoingCtx,
				cusProduct: outgoingCustomerProduct,
				fullCus: fullCustomer,
			});

			outgoing.push({
				plan_id: outgoingCustomerProduct.product.id,
				plan: subscription.plan,
				feature_quantities: cusProductToFeatureQuantities({
					ctx: outgoingCtx,
					cusProduct: outgoingCustomerProduct,
				}),
				effective_at: billingPlanToOutgoingEffectiveAt({
					billingContext,
					autumnBillingPlan: billingPlan.autumn,
				}),
			});
		}
	}

	return { incoming, outgoing };
};
