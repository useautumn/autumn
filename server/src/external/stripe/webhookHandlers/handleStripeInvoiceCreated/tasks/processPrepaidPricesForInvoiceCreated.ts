import {
	addCusProductToCusEnt,
	BillingType,
	customerEntitlementToOptions,
	customerPriceToCustomerEntitlement,
	EntInterval,
	type FullCusEntWithFullCusProduct,
	type FullCustomerPrice,
	notNullish,
} from "@autumn/shared";
import { subToPeriodStartEnd } from "@/external/stripe/stripeSubUtils/convertSubUtils";
import { isStripeSubscriptionVercel } from "@/external/stripe/subscriptions/utils/classifyStripeSubscriptionUtils";
import type { InvoiceCreatedContext } from "@/external/stripe/webhookHandlers/handleStripeInvoiceCreated/setupInvoiceCreatedContext";
import { getCustomerPricesWithCustomerProducts } from "@/external/stripe/webhookHandlers/handleStripeInvoiceCreated/utils/getCustomerPricesWithCustomerProducts";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService";
import { RolloverService } from "@/internal/customers/cusProducts/cusEnts/cusRollovers/RolloverService";
import { getRolloverUpdates } from "@/internal/customers/cusProducts/cusEnts/cusRollovers/rolloverUtils";
import { getResetBalancesUpdate } from "@/internal/customers/cusProducts/cusEnts/groupByUtils";
import { logPrepaidPriceProcessed } from "../logs/logInvoiceCreatedPriceProcessing";

/**
 * Handle reset balance?
 */

const processPrepaidPrice = async ({
	ctx,
	eventContext,
	customerPrice,
	customerEntitlement,
}: {
	ctx: StripeWebhookContext;
	eventContext: InvoiceCreatedContext;
	customerPrice: FullCustomerPrice;
	customerEntitlement: FullCusEntWithFullCusProduct;
}) => {
	const options = customerEntitlementToOptions({
		customerEntitlement,
	});

	const customerProduct = customerEntitlement.customer_product;

	const { stripeSubscription, fullCustomer } = eventContext;
	const { db } = ctx;

	if (!options) return;
	const previousQuantity = options?.quantity ?? 0;
	const resetQuantity = (options?.upcoming_quantity || options?.quantity) ?? 0;
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

	const { end } = subToPeriodStartEnd({ sub: stripeSubscription });

	const rolloverUpdate = getRolloverUpdates({
		cusEnt: customerEntitlement,
		nextResetAt: end * 1000,
	});

	if (notNullish(options?.upcoming_quantity) && customerProduct) {
		const newOptions = customerProduct.options.map((o) => {
			if (o.feature_id === ent.feature_id) {
				return {
					...o,
					quantity: o.upcoming_quantity,
					upcoming_quantity: undefined,
				};
			}
			return o;
		});

		await CusProductService.update({
			ctx,
			cusProductId: customerProduct.id,
			updates: {
				options: newOptions,
			},
		});

		if (ent.interval === EntInterval.Lifetime) {
			const difference =
				(options?.quantity ?? 0) - (options?.upcoming_quantity ?? 0);
			await CusEntService.decrement({
				ctx,
				id: customerEntitlement.id,
				amount: difference,
			});
			return true;
		}
	}

	if (ent.interval === EntInterval.Lifetime) {
		return false;
	}

	if (rolloverUpdate?.toInsert && rolloverUpdate.toInsert.length > 0) {
		await RolloverService.insert({
			ctx,
			rows: rolloverUpdate.toInsert,
			fullCusEnt: customerEntitlement,
		});
	}

	await CusEntService.update({
		ctx,
		id: customerEntitlement.id,
		updates: {
			...resetUpdate,
			next_reset_at: end * 1000,
		},
	});

	logPrepaidPriceProcessed({
		ctx,
		customerEntitlement,
		previousQuantity,
		resetQuantity,
		newAllowance,
		nextResetAt: end * 1000,
	});

	return true;
};

export const processPrepaidPricesForInvoiceCreated = async ({
	ctx,
	eventContext,
}: {
	ctx: StripeWebhookContext;
	eventContext: InvoiceCreatedContext;
}): Promise<void> => {
	const { stripeInvoice, customerProducts, stripeSubscription } = eventContext;

	const isNewPeriod = stripeInvoice.billing_reason === "subscription_cycle";
	const isVercelSubscription = isStripeSubscriptionVercel(stripeSubscription);
	if (!isNewPeriod || isVercelSubscription) return;

	const customerPrices = getCustomerPricesWithCustomerProducts({
		customerProducts,
		filters: {
			billingType: BillingType.UsageInAdvance,
		},
	});

	for (const customerPrice of customerPrices) {
		const cusProduct = customerPrice.customer_product;
		if (!cusProduct) continue;

		const cusEnt = customerPriceToCustomerEntitlement({
			customerPrice,
			customerEntitlements: cusProduct.customer_entitlements,
		});

		if (!cusEnt) continue;

		const cusEntWithProduct = addCusProductToCusEnt({
			cusEnt,
			cusProduct,
		});

		await processPrepaidPrice({
			ctx,
			eventContext,
			customerPrice,
			customerEntitlement: cusEntWithProduct,
		});
	}
};
