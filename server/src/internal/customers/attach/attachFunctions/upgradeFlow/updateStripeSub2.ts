import {
	AttachBranch,
	type AttachConfig,
	type AttachReplaceable,
	ProrationBehavior,
} from "@autumn/shared";
import type Stripe from "stripe";
import { sanitizeSubItems } from "@/external/stripe/stripeSubUtils/getStripeSubItems.js";

import type { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import { freeTrialToStripeTimestamp } from "@/internal/products/free-trials/freeTrialUtils.js";
import { SubService } from "@/internal/subscriptions/SubService.js";
import type { ItemSet } from "@/utils/models/ItemSet.js";
import { createProrationInvoice } from "../../../../../external/stripe/stripeSubUtils/updateStripeSub/createProrationinvoice.js";
import { isStripeSubscriptionCanceling } from "../../../../../external/stripe/subscriptions/utils/classifyStripeSubscriptionUtils.js";

import type { AutumnContext } from "../../../../../honoUtils/HonoEnv.js";
import { attachParamsToCurCusProduct } from "../../attachUtils/convertAttachParams.js";
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
	branch,
}: {
	ctx: AutumnContext;
	attachParams: AttachParams;
	config: AttachConfig;
	curSub: Stripe.Subscription;
	itemSet: ItemSet;
	branch: AttachBranch;
}) => {
	const { db, logger } = ctx;

	const { stripeCli, paymentMethod } = attachParams;
	const { invoiceOnly, proration } = config;

	// if (config.requirePaymentMethod !== false && nullish(paymentMethod)) {
	// 	throw new RecaseError({
	// 		message: "Payment method is required",
	// 		code: "payment_method_required",
	// 	});
	// }

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
				: // : fromCreate
					// 	? "always_invoice"
					"create_prorations",

		trial_end: trialEnd,

		add_invoice_items: itemSet.invoiceItems,
		...(invoiceOnly && {
			collection_method: "send_invoice",
			days_until_due: 30,
		}),
		payment_behavior: "error_if_incomplete",

		expand: ["latest_invoice"],

		// cancel_at_period_end: false,
		// TODO: will error if sub managed by a schedule
		cancel_at_period_end:
			isStripeSubscriptionCanceling(curSub) &&
			!(
				branch === AttachBranch.SameCustomEnts ||
				branch === AttachBranch.NewVersion
			)
				? false
				: undefined,
	});

	let latestInvoice = updatedSub.latest_invoice as Stripe.Invoice | null;

	await SubService.updateFromStripe({ db, stripeSub: updatedSub });

	if (proration === ProrationBehavior.None) {
		return {
			updatedSub,
			latestInvoice: null,
		};
	}

	const curCusProduct = attachParamsToCurCusProduct({ attachParams });
	const cusEntIds: string[] = [];
	const replaceables: AttachReplaceable[] = [];

	if (curCusProduct) {
		const { cusEntIds: newCusEntIds } = await createUsageInvoiceItems({
			db,
			attachParams,
			cusProduct: curCusProduct,
			sub: curSub,
			logger,
		});

		const { replaceables: newReplaceables } = await createAndFilterContUseItems(
			{
				attachParams,
				curMainProduct: curCusProduct,
				sub: curSub,
				logger,
			},
		);

		cusEntIds.push(...newCusEntIds);
		replaceables.push(...newReplaceables);
	}

	let url = null;
	if (proration === ProrationBehavior.Immediately) {
		const res = await createProrationInvoice({
			ctx,
			branch,
			attachParams,
			invoiceOnly,
			curSub,
			updatedSub,
			logger,
		});

		latestInvoice =
			res.invoice || (updatedSub.latest_invoice as Stripe.Invoice);
		url = res.url;
	}

	// If url is returned, it means invoice action is required, so don't reset balances.
	if (curCusProduct) {
		if (!url) {
			await resetUsageBalances({
				ctx,
				cusEntIds,
				cusProduct: curCusProduct,
			});
		} else {
			attachParams.cusEntIds = cusEntIds;
		}
	}

	return {
		updatedSub,
		latestInvoice: latestInvoice,
		cusEntIds,
		replaceables,
		url,
	};
};
