import {
	type AttachConfig,
	ProrationBehavior,
	RecaseError,
} from "@autumn/shared";
import type Stripe from "stripe";
import { sanitizeSubItems } from "@/external/stripe/stripeSubUtils/getStripeSubItems.js";
import { createProrationInvoice } from "@/external/stripe/stripeSubUtils/updateStripeSub/createProrationinvoice.js";
import type { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import { freeTrialToStripeTimestamp } from "@/internal/products/free-trials/freeTrialUtils.js";
import { SubService } from "@/internal/subscriptions/SubService.js";
import { nullish } from "@/utils/genUtils.js";
import type { ItemSet } from "@/utils/models/ItemSet.js";
import type { AutumnContext } from "../../../../../honoUtils/HonoEnv.js";
import { attachParamToCusProducts } from "../../attachUtils/convertAttachParams.js";
import { createAndFilterContUseItems } from "../../attachUtils/getContUseItems/createContUseInvoiceItems.js";
import {
	createUsageInvoiceItems,
	resetUsageBalances,
} from "../upgradeDiffIntFlow/createUsageInvoiceItems.js";

export const updateStripeSub2 = async ({
	ctx,
	attachParams,
	config,
	curSub,
	itemSet,
	fromCreate = false,
}: {
	ctx: AutumnContext;
	attachParams: AttachParams;
	config: AttachConfig;
	curSub: Stripe.Subscription;
	itemSet: ItemSet;
	fromCreate?: boolean;
}) => {
	const { db, logger } = ctx;

	const { stripeCli, paymentMethod } = attachParams;
	const { invoiceOnly, proration } = config;

	if (config.requirePaymentMethod !== false && nullish(paymentMethod)) {
		throw new RecaseError({
			message: "Payment method is required",
			code: "payment_method_required",
		});
	}

	if (curSub.billing_mode.type !== "flexible") {
		curSub = await stripeCli.subscriptions.migrate(curSub.id, {
			billing_mode: { type: "flexible" },
		});
	}

	const trialEnd =
		config.disableTrial || config.carryTrial
			? undefined
			: attachParams.freeTrial
				? freeTrialToStripeTimestamp({
						freeTrial: attachParams.freeTrial,
						now: attachParams.now,
					})
				: undefined;

	// 1. Update subscription

	const updatedSub = await stripeCli.subscriptions.update(curSub.id, {
		items: sanitizeSubItems(itemSet.subItems),
		proration_behavior:
			proration === ProrationBehavior.None
				? "none"
				: fromCreate
					? "always_invoice"
					: "create_prorations",

		trial_end: trialEnd,

		add_invoice_items: itemSet.invoiceItems,
		...(invoiceOnly && {
			collection_method: "send_invoice",
			days_until_due: 30,
		}),
		payment_behavior: "error_if_incomplete",

		expand: ["latest_invoice"],
	});

	let latestInvoice = updatedSub.latest_invoice as Stripe.Invoice | null;

	await SubService.updateFromStripe({ db, stripeSub: updatedSub });

	if (proration === ProrationBehavior.None) {
		return {
			updatedSub,
			latestInvoice: null,
		};
	}

	if (fromCreate) {
		return {
			updatedSub,
			latestInvoice: updatedSub.latest_invoice as Stripe.Invoice,
		};
	}

	const { curMainProduct } = attachParamToCusProducts({ attachParams });

	// 2. Create prorations for single use items
	const { cusEntIds } = await createUsageInvoiceItems({
		db,
		attachParams,
		cusProduct: curMainProduct!,
		sub: curSub,
		logger,
	});

	const { replaceables } = await createAndFilterContUseItems({
		attachParams,
		curMainProduct: curMainProduct!,
		sub: curSub,
		logger,
	});

	let url = null;
	if (proration === ProrationBehavior.Immediately) {
		const res = await createProrationInvoice({
			ctx,
			attachParams,
			invoiceOnly,
			curSub,
			updatedSub,
			logger,
		});

		latestInvoice = res.invoice;
		url = res.url;

		console.log(`FINALIZED INVOICE ${latestInvoice?.id}`);
		console.log(latestInvoice?.lines.data.map((line) => line.description));
	}

	// If url is returned, it means invoice action is required, so don't reset balances.
	if (!url) {
		await resetUsageBalances({
			db,
			cusEntIds,
			cusProduct: curMainProduct!,
		});
	} else {
		// reset balances later when invoice is paid
		attachParams.cusEntIds = cusEntIds;
	}

	return {
		updatedSub,
		latestInvoice: latestInvoice,
		cusEntIds,
		replaceables,
		url,
	};
};
