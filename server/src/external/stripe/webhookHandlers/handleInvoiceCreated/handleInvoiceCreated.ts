import {
	BillingType,
	customerPriceToCustomerEntitlement,
	type FullCusProduct,
	isFixedPrice,
} from "@autumn/shared";
import type Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { cusProductToSub } from "@/internal/customers/cusProducts/cusProductUtils/convertCusProduct.js";
import { getBillingType } from "@/internal/products/prices/priceUtils.js";
import { stripeInvoiceToStripeSubscriptionId } from "../../invoices/utils/convertStripeInvoice";
import { subToPeriodStartEnd } from "../../stripeSubUtils/convertSubUtils.js";
import { handleContUsePrices } from "./handleContUsePrices.js";
import { handlePrepaidPrices } from "./handlePrepaidPrices.js";
import { handleUsagePrices } from "./handleUsagePrices.js";

// For cancel at period end: invoice period start = sub period start (cur cycle), invoice period end = sub period end (a month later...)
// For cancel immediately: invoice period start = sub period start (cur cycle), invoice period end cancel immediately date
// For regular billing: invoice period end = sub period start (next cycle)
// For upgrade, bill_immediately: invoice period start = sub period start (cur cycle), invoice period end cancel immediately date

export const sendUsageAndReset = async ({
	ctx,
	activeProduct,
	invoice,
	submitUsage = true,
	resetBalance = true,
}: {
	ctx: AutumnContext;
	activeProduct: FullCusProduct;
	invoice: Stripe.Invoice;
	submitUsage?: boolean;
	resetBalance?: boolean;
}) => {
	const { org, env, logger } = ctx;
	const stripeCli = createStripeCli({ org, env });

	const cusEnts = activeProduct.customer_entitlements;
	const cusPrices = activeProduct.customer_prices;
	const customer = activeProduct.customer!;

	const handled: boolean[] = [];
	for (const cusPrice of cusPrices) {
		const price = cusPrice.price;
		const billingType = getBillingType(price.config);

		if (isFixedPrice(price)) continue;

		const relatedCusEnt = customerPriceToCustomerEntitlement({
			customerPrice: cusPrice,
			customerEntitlements: cusEnts,
		});

		if (!relatedCusEnt) continue;

		const usageBasedSub = await cusProductToSub({
			cusProduct: activeProduct,
			stripeCli,
		});

		const subId = stripeInvoiceToStripeSubscriptionId(invoice);

		if (!usageBasedSub || usageBasedSub.id !== subId) continue;

		// If trial just ended, skip
		const { start } = subToPeriodStartEnd({ sub: usageBasedSub });

		if (usageBasedSub.trial_end === start) {
			logger.info(`Trial just ended, skipping usage invoice.created`);
			continue;
		}

		if (billingType === BillingType.UsageInArrear) {
			const handledUsage = await handleUsagePrices({
				ctx,
				invoice,
				customer,
				relatedCusEnt,
				stripeCli,
				price,
				usageSub: usageBasedSub,
				activeProduct,
				submitUsage,
				resetBalance,
			});

			handled.push(handledUsage);
		}

		if (billingType === BillingType.InArrearProrated) {
			const handledContUse = await handleContUsePrices({
				ctx,
				cusEnts,
				cusPrice,
				invoice,
				usageSub: usageBasedSub,
				resetBalance,
			});

			handled.push(handledContUse);
		}

		if (billingType === BillingType.UsageInAdvance) {
			const handledPrepaid = await handlePrepaidPrices({
				ctx,
				cusPrice,
				cusProduct: activeProduct,
				usageSub: usageBasedSub,
				invoice,
				resetBalance,
			});

			handled.push(handledPrepaid);
		}
	}
};
