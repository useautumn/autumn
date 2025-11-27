import {
	type AttachConfig,
	type AttachFunctionResponse,
	AttachFunctionResponseSchema,
	AttachScenario,
	ErrCode,
	isTrialing,
	SuccessCode,
} from "@autumn/shared";
import type Stripe from "stripe";
import { getEarliestPeriodEnd } from "@/external/stripe/stripeSubUtils/convertSubUtils.js";
import { getStripeSubItems2 } from "@/external/stripe/stripeSubUtils/getStripeSubItems.js";
import { subIsCanceled } from "@/external/stripe/stripeSubUtils.js";
import { createFullCusProduct } from "@/internal/customers/add-product/createFullCusProduct.js";
import { handleCreateCheckout } from "@/internal/customers/add-product/handleCreateCheckout.js";
import { type AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import { insertInvoiceFromAttach } from "@/internal/invoices/invoiceUtils.js";
import { getNextStartOfMonthUnix } from "@/internal/products/prices/billingIntervalUtils.js";
import { addIntervalToAnchor } from "@/internal/products/prices/billingIntervalUtils2.js";
import { getSmallestInterval } from "@/internal/products/prices/priceUtils/priceIntervalUtils.js";
import { attachToInsertParams } from "@/internal/products/productUtils.js";
import RecaseError from "@/utils/errorUtils.js";
import type { AutumnContext } from "../../../../../honoUtils/HonoEnv.js";
import { getCustomerDisplay } from "../../../../billing/attach/utils/getCustomerDisplay.js";
import {
	getCustomerSchedule,
	getCustomerSub,
} from "../../attachUtils/convertAttachParams.js";
import { paramsToSubItems } from "../../mergeUtils/paramsToSubItems.js";
import { subToNewSchedule } from "../../mergeUtils/subToNewSchedule.js";
import { handleUpgradeFlowSchedule } from "../upgradeFlow/handleUpgradeFlowSchedule.js";
import { updateStripeSub2 } from "../upgradeFlow/updateStripeSub2.js";
import { createStripeSub2 } from "./createStripeSub2.js";

export const handlePaidProduct = async ({
	ctx,
	attachParams,
	config,
}: {
	ctx: AutumnContext;
	attachParams: AttachParams;
	config: AttachConfig;
}): Promise<AttachFunctionResponse> => {
	const { logger, db } = ctx;

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

	const { sub: mergeSub, cusProduct: mergeCusProduct } = await getCustomerSub({
		attachParams,
	});

	let sub: Stripe.Subscription | null = null;
	let schedule: Stripe.SubscriptionSchedule | null | undefined = null;
	let invoice: Stripe.Invoice | undefined;
	let trialEndsAt: number | null | undefined;

	// 1. If merge sub

	if (mergeSub && !config.disableMerge) {
		if (mergeCusProduct?.free_trial) {
			trialEndsAt = isTrialing({
				cusProduct: mergeCusProduct,
				now: attachParams.now,
			})
				? mergeCusProduct.trial_ends_at
				: undefined;
		}
		attachParams.freeTrial = null;
		// 1. If merged sub is canceled, also add to current schedule
		const newItemSet = await paramsToSubItems({
			ctx,
			sub: mergeSub,
			attachParams,
			config,
		});

		const { updatedSub, latestInvoice } = await updateStripeSub2({
			ctx,
			attachParams,
			curSub: mergeSub,
			itemSet: newItemSet,
			config,
			fromCreate: true,
		});

		sub = updatedSub;

		if (latestInvoice) {
			invoice = await insertInvoiceFromAttach({
				db,
				stripeInvoice: latestInvoice,
				attachParams,
				logger,
			});
		}
		if (subIsCanceled({ sub: mergeSub })) {
			logger.info("ADD PRODUCT FLOW, CREATING NEW SCHEDULE");
			schedule = await subToNewSchedule({
				ctx,
				sub: mergeSub,
				attachParams,
				config,
				endOfBillingPeriod: mergeSub.cancel_at!,
				removeCusProducts: attachParams.cusProducts.filter((cp) => cp.canceled),
			});
		} else {
			const res = await getCustomerSchedule({
				attachParams,
				subId: mergeSub.id,
				logger,
			});
			schedule = res.schedule;
			logger.info(`ADD PRODUCT FLOW, SCHEDULE ID: ${schedule?.id}`);
			if (schedule) {
				await handleUpgradeFlowSchedule({
					ctx,
					attachParams,
					config,
					schedule,
					curSub: mergeSub,
					removeCusProducts: [],
					fromAddProduct: true,
				});
			}
		}
	} else {
		let billingCycleAnchorUnix: number | undefined;
		const smallestInterval = getSmallestInterval({
			prices: attachParams.prices,
		});

		// 1. If anchor to start of month, get next month anchor
		if (org.config.anchor_start_of_month) {
			billingCycleAnchorUnix = getNextStartOfMonthUnix({
				interval: smallestInterval!.interval,
				intervalCount: smallestInterval!.intervalCount,
			});
		}

		// 2. If merge sub anchor, use it
		if (mergeSub && !config.disableMerge) {
			billingCycleAnchorUnix = addIntervalToAnchor({
				anchorUnix: mergeSub.billing_cycle_anchor * 1000,
				intervalConfig: smallestInterval!,
				now: attachParams.now,
			});
		}

		// 3. If billing cycle anchor, just use it
		if (attachParams.billingAnchor) {
			billingCycleAnchorUnix = attachParams.billingAnchor;
		}

		// console.log("Item set: ", itemSet);
		try {
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
					db: ctx.db,
					stripeInvoice: sub.latest_invoice as Stripe.Invoice,
					attachParams,
					logger,
				});
			}
		} catch (error) {
			if (
				error instanceof RecaseError &&
				!invoiceOnly &&
				error.code === ErrCode.CreateStripeSubscriptionFailed
			) {
				return await handleCreateCheckout({
					ctx,
					attachParams,
					config,
				});
			}

			throw error;
		}
	}

	subscriptions.push(sub);

	const anchorToUnix = getEarliestPeriodEnd({ sub }) * 1000;

	if (config.invoiceCheckout) {
		return AttachFunctionResponseSchema.parse({
			invoice: subscriptions?.[0]?.latest_invoice as Stripe.Invoice,
			stripeSub: subscriptions?.[0],
			anchorToUnix,
			config,
		});
		// return {
		// 	invoices: subscriptions.map((s) => s.latest_invoice as Stripe.Invoice),
		// 	subs: subscriptions,
		// 	anchorToUnix,
		// 	config,
		// };
	}

	// Add product and entitlements to customer
	const batchInsert = [];

	for (const product of products) {
		batchInsert.push(
			createFullCusProduct({
				db: ctx.db,
				attachParams: attachToInsertParams(attachParams, product),
				subscriptionIds: subscriptions.map((s) => s.id),
				subscriptionScheduleIds: schedule ? [schedule.id] : undefined,
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

	// if (res) {
	// const productNames = products.map((p) => p.name).join(", ");
	// const customerName = customer.name || customer.email || customer.id;
	// if (req.apiVersion.gte(ApiVersion.V1_1)) {
	// 	res.status(200).json(
	// 		AttachResultSchema.parse({
	// 			message: `Successfully created subscriptions and attached ${productNames} to ${customerName}`,
	// 			code: SuccessCode.NewProductAttached,
	// 			product_ids: products.map((p) => p.id),
	// 			customer_id: customer.id || customer.internal_id,
	// 			invoice: invoiceOnly
	// 				? attachToInvoiceResponse({ invoice })
	// 				: undefined,
	// 		}),
	// 	);
	// } else {
	// 	res.status(200).json({
	// 		success: true,
	// 		message: `Successfully created subscriptions and attached ${products
	// 			.map((p) => p.name)
	// 			.join(", ")} to ${customer.name}`,
	// 		invoice: invoiceOnly ? invoice : undefined,
	// 	});
	// }
	// }
};
