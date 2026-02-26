import {
	type AutoTopup,
	type AutumnBillingPlan,
	cusEntsToCurrentBalance,
	cusEntWithOptionQuantity,
	type Feature,
	type FullCusEntWithFullCusProduct,
	type FullCustomer,
	type FullCustomerPrice,
	type LineItemContext,
	orgToCurrency,
	type UsagePriceConfig,
	usagePriceToLineItem,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { getCusPaymentMethod } from "@/external/stripe/stripeCusUtils.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { executeAutumnBillingPlan } from "@/internal/billing/v2/execute/executeAutumnBillingPlan.js";
import { lineItemsToInvoiceAddLinesParams } from "@/internal/billing/v2/providers/stripe/utils/invoiceLines/lineItemsToInvoiceAddLinesParams.js";
import { createInvoiceForBilling } from "@/internal/billing/v2/providers/stripe/utils/invoices/createInvoiceForBilling.js";
import { buildMinimalBillingContext } from "@/internal/billing/v2/utils/billingContext/buildMinimalBillingContext.js";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService.js";
import { updateCachedCusProductOptions } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/updateCachedCusProductOptions.js";
import { incrementAutoTopUpCounter } from "./autoTopUpRateLimit.js";
import { buildUpdatedOptions } from "./autoTopUpUtils.js";

/** Execute the auto top-up: charge via billing v2 pipeline and update balances. */
export const executeAutoTopUp = async ({
	ctx,
	fullCustomer,
	feature,
	autoTopupConfig,
	cusEnts,
	cusPrice,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	feature: Feature;
	autoTopupConfig: AutoTopup;
	cusEnts: FullCusEntWithFullCusProduct[];
	cusPrice: FullCustomerPrice;
}) => {
	const { org, env, logger } = ctx;
	const quantity = autoTopupConfig.quantity;
	const cusEnt = cusEnts[0];
	const cusProduct = cusEnt.customer_product;

	logger.info(
		`[executeAutoTopUp] Starting auto top-up for feature ${feature.id}, quantity: ${quantity}`,
	);

	// 1. Init Stripe client + get payment method
	const stripeCli = createStripeCli({ org, env });
	const stripeCustomerId = fullCustomer.processor?.id;

	if (!stripeCustomerId) {
		logger.warn(
			`[executeAutoTopUp] No Stripe customer ID for customer ${fullCustomer.id || fullCustomer.internal_id}`,
		);
		return;
	}

	const paymentMethod = await getCusPaymentMethod({
		stripeCli,
		stripeId: stripeCustomerId,
	});

	if (!paymentMethod) {
		logger.warn(
			`[executeAutoTopUp] No payment method for customer ${stripeCustomerId}`,
		);
		return;
	}

	if (!cusProduct) {
		logger.warn(
			`[executeAutoTopUp] No customer product for cusEnt ${cusEnt.id}`,
		);
		return;
	}

	// Convert credits to packs (billing units). options.quantity is in packs,
	// and cusEntsToPrepaidQuantity multiplies options.quantity × billing_units
	// to get credits. So we divide by billing_units here.
	const priceConfig = cusPrice.price.config as UsagePriceConfig;
	const billingUnits = priceConfig.billing_units ?? 1;
	const topUpPacks = new Decimal(quantity).div(billingUnits).toNumber();

	// 2. Build line item via usagePriceToLineItem
	//    Override options.quantity to ONLY the top-up packs so
	//    cusEntsToPrepaidQuantity prices just the delta (packs × billing_units = credits).
	const lineItem = usagePriceToLineItem({
		cusEnt: cusEntWithOptionQuantity({ cusEnt, feature, quantity: topUpPacks }),
		context: {
			price: cusPrice.price,
			product: cusProduct.product,
			feature,
			currency: orgToCurrency({ org }),
			direction: "charge",
			now: Date.now(),
			billingTiming: "in_advance",
		} satisfies LineItemContext,
		options: {
			shouldProrateOverride: false,
			chargeImmediatelyOverride: true,
		},
	});

	if (lineItem.amount <= 0) {
		logger.warn(
			`[executeAutoTopUp] Calculated amount is ${lineItem.amount} for feature ${feature.id}, skipping`,
		);
		return;
	}

	// 3. Build Stripe invoice action from line items
	const addLineParams = lineItemsToInvoiceAddLinesParams({
		lineItems: [lineItem],
	});

	// 4. Pre-sync Redis balance to Postgres before invoice creation.
	//    Stripe webhooks from the invoice will delete the Redis cache, causing
	//    the async deduction sync to skip (cache_miss). This ensures the
	//    subsequent CusEntService.increment operates on the correct base value.
	const currentBalance = cusEntsToCurrentBalance({ cusEnts });
	await CusEntService.update({
		ctx,
		id: cusEnt.id,
		updates: { balance: currentBalance },
	});

	// 5. Create + pay invoice via billing v2 pipeline
	const billingContext = buildMinimalBillingContext({
		fullCustomer,
		stripeCustomerId,
		paymentMethod,
	});

	const invoiceResult = await createInvoiceForBilling({
		ctx,
		billingContext,
		stripeInvoiceAction: { addLineParams: { lines: addLineParams } },
	});

	if (!invoiceResult.paid) {
		try {
			await stripeCli.invoices.voidInvoice(invoiceResult.invoice.id);
		} catch (e) {
			logger.warn(
				`[executeAutoTopUp] Failed to void invoice ${invoiceResult.invoice.id}: ${e}`,
			);
		}
		logger.error(
			`[executeAutoTopUp] Payment failed for feature ${feature.id}, invoice ${invoiceResult.invoice.id}`,
		);
		return;
	}

	// 6. Build + execute Autumn billing plan (Postgres + Redis balance/options)
	const autumnBillingPlan: AutumnBillingPlan = {
		insertCustomerProducts: [],
		updateCustomerEntitlements: [
			{
				customerEntitlement: cusEnt,
				balanceChange: quantity,
			},
		],
		updateCustomerProduct: {
			customerProduct: cusProduct,
			updates: {
				options: buildUpdatedOptions({ cusProduct, feature, topUpPacks }),
			},
		},
	};

	await executeAutumnBillingPlan({ ctx, autumnBillingPlan });

	// 7. Sync cusProduct options to Redis cache (balance is synced
	//    by updateCustomerEntitlements via incrementCachedCusEntBalance)
	const customerId = fullCustomer.id || fullCustomer.internal_id;

	await updateCachedCusProductOptions({
		ctx,
		customerId,
		internalFeatureId: feature.internal_id,
		featureId: feature.id,
		delta: topUpPacks,
	});

	// 8. Increment rate limit counter
	if (autoTopupConfig.max_purchases) {
		await incrementAutoTopUpCounter({
			orgId: org.id,
			env,
			customerId,
			featureId: feature.id,
			maxPurchases: autoTopupConfig.max_purchases,
		});
	}

	logger.info(
		`[executeAutoTopUp] Successfully topped up feature ${feature.id} by ${quantity}`,
	);
};
