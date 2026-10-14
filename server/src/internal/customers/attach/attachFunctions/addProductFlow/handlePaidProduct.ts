import {
	type AttachBranch,
	type AttachConfig,
	type AttachFunctionResponse,
	AttachFunctionResponseSchema,
	AttachScenario,
	MetadataType,
	SuccessCode,
	secondsToMs,
} from "@autumn/shared";
import { addMinutes } from "date-fns";
import type Stripe from "stripe";
import { getStripeSubItems2 } from "@/external/stripe/stripeSubUtils/getStripeSubItems.js";
import { attachParamsToMetadata } from "@/internal/billing/attach/utils/attachParamsToMetadata.js";
import { billingActions } from "@/internal/billing/v2/actions/index.js";
import { createFullCusProduct } from "@/internal/customers/add-product/createFullCusProduct.js";
import type { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import { insertInvoiceFromAttach } from "@/internal/invoices/invoiceUtils.js";
import { getNextStartOfMonthUnix } from "@/internal/products/prices/billingIntervalUtils.js";
import { addIntervalToAnchor } from "@/internal/products/prices/billingIntervalUtils2.js";
import { getSmallestInterval } from "@/internal/products/prices/priceUtils/priceIntervalUtils.js";
import { attachToInsertParams } from "@/internal/products/productUtils.js";
import type { AutumnContext } from "../../../../../honoUtils/HonoEnv.js";
import { getCustomerDisplay } from "../../../../billing/attach/utils/getCustomerDisplay.js";
import { getCustomerSub } from "../../attachUtils/convertAttachParams.js";
import { createStripeSub2 } from "./createStripeSub2.js";

export const handlePaidProduct = async ({
	ctx,
	attachParams,
	config,
	branch,
}: {
	ctx: AutumnContext;
	attachParams: AttachParams;
	config: AttachConfig;
	branch: AttachBranch;
}): Promise<AttachFunctionResponse> => {
	const { logger } = ctx;

	const {
		org,
		customer,
		products,

		invoiceOnly,

		stripeCli,
	} = attachParams;

	if (config.disableTrial) {
		attachParams.freeTrial = null;
	}

	const itemSet = await getStripeSubItems2({
		attachParams,
		config,
	});

	const subscriptions: Stripe.Subscription[] = [];

	let { sub: mergeSub, cusProduct: mergeCusProduct } = await getCustomerSub({
		attachParams,
	});

	if (attachParams.newBillingSubscription) {
		mergeSub = undefined;
		mergeCusProduct = undefined;
	}

	let sub: Stripe.Subscription | null = null;

	let invoice: Stripe.Invoice | undefined;
	let trialEndsAt: number | null | undefined;

	if (mergeSub && !config.disableMerge) {
		const { billingResponse, billingResult } =
			await billingActions.legacy.attach({
				ctx,
				attachParams,
				planTiming: "immediate",
			});

		return AttachFunctionResponseSchema.parse({
			code: SuccessCode.NewProductAttached,
			message: `Successfully attached product`,

			checkout_url: billingResponse?.payment_url ?? undefined,

			invoice: attachParams.invoiceOnly
				? billingResult?.stripe?.stripeInvoice
				: undefined,
		});
	} else {
		let billingCycleAnchorUnix: number | undefined;
		const smallestInterval = getSmallestInterval({
			prices: attachParams.prices,
		});

		if (org.config.anchor_start_of_month) {
			billingCycleAnchorUnix = getNextStartOfMonthUnix({
				interval: smallestInterval!.interval,
				intervalCount: smallestInterval!.intervalCount,
			});
		}

		if (mergeSub && !config.disableMerge) {
			billingCycleAnchorUnix = addIntervalToAnchor({
				anchorUnix: mergeSub.billing_cycle_anchor * 1000,
				intervalConfig: smallestInterval!,
				now: attachParams.now,
			});
		}

		if (attachParams.billingAnchor) {
			billingCycleAnchorUnix = attachParams.billingAnchor;
		}

		sub = await createStripeSub2({
			db: ctx.db,
			stripeCli,
			attachParams,
			itemSet,
			billingCycleAnchorUnix,
			config,
			logger,
		});

		if (sub?.latest_invoice) {
			invoice = await insertInvoiceFromAttach({
				ctx,
				stripeInvoice: sub.latest_invoice as Stripe.Invoice,
				attachParams,
				logger,
			});
		}

		const subInvoice: Stripe.Invoice | undefined =
			sub.latest_invoice as Stripe.Invoice;

		if (subInvoice && subInvoice.status === "open" && !config.invoiceCheckout) {
			logger.info(
				`[create subscription] invoice checkout created because invoice is open: ${subInvoice.id}`,
			);
			const metadata = await attachParamsToMetadata({
				db: ctx.db,
				attachParams: {
					...attachParams,
					subId: sub.id,
					anchorToUnix: sub.billing_cycle_anchor * 1000,
					config,
				},
				type: MetadataType.InvoiceCheckout,
				stripeInvoiceId: subInvoice.id as string,
				expiresAt: addMinutes(Date.now(), 10).getTime(),
			});

			await stripeCli.invoices.update(subInvoice.id, {
				metadata: {
					autumn_metadata_id: metadata.id,
				},
			});
			return AttachFunctionResponseSchema.parse({
				checkout_url: subInvoice.hosted_invoice_url,
				code: SuccessCode.InvoiceActionRequired,
				message: "Payment action required",
			});
		}
	}

	subscriptions.push(sub);

	const anchorToUnix = secondsToMs(sub.billing_cycle_anchor);

	if (config.invoiceCheckout) {
		return AttachFunctionResponseSchema.parse({
			invoice: subscriptions?.[0]?.latest_invoice as Stripe.Invoice,
			stripeSub: subscriptions?.[0],
			anchorToUnix,
			config,
		});
	}

	const batchInsert = [];

	for (const product of products) {
		batchInsert.push(
			createFullCusProduct({
				db: ctx.db,
				attachParams: attachToInsertParams(attachParams, product),
				subscriptionIds: subscriptions.map((s) => s.id),
				anchorToUnix,
				carryExistingUsages: config.carryUsage,
				scenario: AttachScenario.New,
				trialEndsAt: trialEndsAt || undefined,
				logger,
			}),
		);
	}
	await Promise.all(batchInsert);

	const productNames = products.map((p) => p.name).join(", ");
	const customerName = getCustomerDisplay({ customer });
	return AttachFunctionResponseSchema.parse({
		message: `Successfully created subscriptions and attached product(s) ${productNames} to customer ${customerName}`,
		code: SuccessCode.NewProductAttached,
		product_ids: products.map((p) => p.id),
		customer_id: customer.id || customer.internal_id,
		invoice: invoiceOnly ? invoice : undefined,
	});
};
