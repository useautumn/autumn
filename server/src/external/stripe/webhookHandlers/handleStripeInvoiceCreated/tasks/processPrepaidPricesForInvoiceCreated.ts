import {
	addCusProductToCusEnt,
	BillingType,
	clampNextResetAtToPendingBillingCycleAnchor,
	customerEntitlementToOptions,
	customerPriceToCustomerEntitlement,
	EntInterval,
	type FullCusEntWithFullCusProduct,
	type FullCustomerPrice,
	getResetBalancesUpdate,
	getRolloverUpdates,
	isCustomerEntitlementPrepaidWithSeparateResetInterval,
	isEntityScopedCusEnt,
	isPooledBalanceSourceCustomerEntitlement,
	notNullish,
	secondsToMs,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import { isStripeInvoiceForNewPeriod } from "@/external/stripe/invoices/utils/classifyStripeInvoice.js";
import { subToPeriodStartEnd } from "@/external/stripe/stripeSubUtils/convertSubUtils";
import { isStripeSubscriptionVercel } from "@/external/stripe/subscriptions/utils/classifyStripeSubscriptionUtils";
import type { InvoiceCreatedContext } from "@/external/stripe/webhookHandlers/handleStripeInvoiceCreated/setupInvoiceCreatedContext";
import { getCustomerPricesWithCustomerProducts } from "@/external/stripe/webhookHandlers/handleStripeInvoiceCreated/utils/getCustomerPricesWithCustomerProducts";
import { isBillingCycleAnchorResetInvoice } from "@/external/stripe/webhookHandlers/handleStripeInvoiceCreated/utils/isBillingCycleAnchorResetInvoice";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import type { AutumnBillingPlanBuilder } from "@/internal/billing/v2/utils/billingPlanBuilder/createAutumnBillingPlanBuilder";
import { logPrepaidPriceProcessed } from "../logs/logInvoiceCreatedPriceProcessing.js";

/** Plans one prepaid grant's new cycle: its promoted quantity, then its refill unless it resets on its own interval. */
const processPrepaidPrice = ({
	ctx,
	eventContext,
	plan,
	customerPrice,
	customerEntitlement,
	resetsBillingCycleAnchor,
}: {
	ctx: StripeWebhookContext;
	eventContext: InvoiceCreatedContext;
	plan: AutumnBillingPlanBuilder;
	customerPrice: FullCustomerPrice;
	customerEntitlement: FullCusEntWithFullCusProduct;
	resetsBillingCycleAnchor: boolean;
}) => {
	const options = customerEntitlementToOptions({
		customerEntitlement,
	});

	const customerProduct = customerEntitlement.customer_product;

	const { stripeSubscription } = eventContext;

	if (!options) return;
	const previousQuantity = options?.quantity ?? 0;
	const resetQuantity = options.upcoming_quantity ?? options.quantity ?? 0;
	const config = customerPrice.price.config;
	const billingUnits = config.billing_units || 1;
	const newAllowance =
		resetQuantity * billingUnits +
		(customerEntitlement.entitlement.allowance ?? 0);

	const resetUpdate = getResetBalancesUpdate({
		cusEnt: customerEntitlement,
		allowance: newAllowance,
	});

	const ent = customerEntitlement.entitlement;
	const hasSeparateResetInterval =
		isCustomerEntitlementPrepaidWithSeparateResetInterval({
			customerEntitlement,
			customerPrice,
		});

	const { start, end } = subToPeriodStartEnd({ sub: stripeSubscription });

	const rolloverUpdate = getRolloverUpdates({
		cusEnt: customerEntitlement,
		nextResetAt: start * 1000,
	});

	if (notNullish(options?.upcoming_quantity) && customerProduct) {
		const newOptions = customerProduct.options.map((o) => {
			if (o.feature_id === ent.feature_id) {
				return {
					...o,
					quantity: o.upcoming_quantity ?? o.quantity,
					upcoming_quantity: undefined,
				};
			}
			return o;
		});

		plan.updateCustomerProduct({
			customerProduct,
			updates: { options: newOptions },
		});

		if (ent.interval === EntInterval.Lifetime) {
			const difference =
				(options?.quantity ?? 0) - (options?.upcoming_quantity ?? 0);
			plan.updateCustomerEntitlement({
				customerEntitlement,
				...(isEntityScopedCusEnt(customerEntitlement)
					? {
							entityBalanceChanges: Object.fromEntries(
								Object.keys(customerEntitlement.entities ?? {}).map(
									(entityId) => [
										entityId,
										new Decimal(difference).mul(billingUnits).neg().toNumber(),
									],
								),
							),
						}
					: { balanceChange: -difference }),
			});
			return;
		}
	}

	if (hasSeparateResetInterval) {
		logPrepaidPriceProcessed({
			ctx,
			customerEntitlement,
			previousQuantity,
			resetQuantity,
			newAllowance,
			nextResetAt: customerEntitlement.next_reset_at ?? end * 1000,
		});
		return;
	}

	if (ent.interval === EntInterval.Lifetime) return;

	const nextResetAt = clampNextResetAtToPendingBillingCycleAnchor({
		billingCycleAnchorResetsAt: customerProduct?.billing_cycle_anchor_resets_at,
		currentEpochMs: eventContext.nowMs,
		nextResetAt: end * 1000,
	});
	plan.updateCustomerEntitlement({
		customerEntitlement,
		updates: {
			...resetUpdate,
			...(isPooledBalanceSourceCustomerEntitlement({ customerEntitlement })
				? { balance: 0, additional_balance: 0, adjustment: 0, entities: null }
				: {}),
			next_reset_at: nextResetAt,
			...(resetsBillingCycleAnchor
				? {
						reset_cycle_anchor: secondsToMs(
							stripeSubscription.billing_cycle_anchor,
						),
					}
				: {}),
		},
		insertRollovers: rolloverUpdate.toInsert,
	});

	logPrepaidPriceProcessed({
		ctx,
		customerEntitlement,
		previousQuantity,
		resetQuantity,
		newAllowance,
		nextResetAt,
	});
};

export const processPrepaidPricesForInvoiceCreated = ({
	ctx,
	eventContext,
	plan,
}: {
	ctx: StripeWebhookContext;
	eventContext: InvoiceCreatedContext;
	plan: AutumnBillingPlanBuilder;
}): void => {
	const { stripeInvoice, customerProducts, stripeSubscription } = eventContext;

	const isNewPeriod = isStripeInvoiceForNewPeriod(stripeInvoice);
	const anchorResetCustomerProductIds = new Set(
		eventContext.billingCycleAnchorResetCustomerProductIds,
	);
	const isAnchorResetInvoice = isBillingCycleAnchorResetInvoice({
		eventContext,
	});
	const isVercelSubscription = isStripeSubscriptionVercel(stripeSubscription);
	if ((!isNewPeriod && !isAnchorResetInvoice) || isVercelSubscription) return;

	const customerPrices = getCustomerPricesWithCustomerProducts({
		customerProducts,
		filters: {
			billingType: BillingType.UsageInAdvance,
		},
	});

	for (const customerPrice of customerPrices) {
		const cusProduct = customerPrice.customer_product;
		if (!cusProduct) continue;
		const resetsBillingCycleAnchor = anchorResetCustomerProductIds.has(
			cusProduct.id,
		);
		if (!isNewPeriod && !resetsBillingCycleAnchor) continue;

		const cusEnt = customerPriceToCustomerEntitlement({
			customerPrice,
			customerEntitlements: cusProduct.customer_entitlements,
		});

		if (!cusEnt) continue;

		processPrepaidPrice({
			ctx,
			eventContext,
			plan,
			customerPrice,
			customerEntitlement: addCusProductToCusEnt({ cusEnt, cusProduct }),
			resetsBillingCycleAnchor,
		});
	}
};
