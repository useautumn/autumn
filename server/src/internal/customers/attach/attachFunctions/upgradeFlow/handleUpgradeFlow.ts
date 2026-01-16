import {
	AttachBranch,
	type AttachConfig,
	AttachFunctionResponseSchema,
	AttachScenario,
	CusProductStatus,
	cusProductToPrices,
	cusProductToProduct,
	type FullCusProduct,
	isCustomerProductCanceling,
	ProrationBehavior,
	SuccessCode,
} from "@autumn/shared";
import type Stripe from "stripe";
import { getEarliestPeriodEnd } from "@/external/stripe/stripeSubUtils/convertSubUtils.js";
import { getStripeSubItems2 } from "@/external/stripe/stripeSubUtils/getStripeSubItems.js";
import { isStripeSubscriptionCanceled } from "@/external/stripe/subscriptions/utils/classifyStripeSubscriptionUtils.js";
import { addProductsUpdatedWebhookTask } from "@/internal/analytics/handlers/handleProductsUpdated.js";
import { createFullCusProduct } from "@/internal/customers/add-product/createFullCusProduct.js";
import type { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";
import { getExistingCusProducts } from "@/internal/customers/cusProducts/cusProductUtils/getExistingCusProducts.js";
import {
	attachToInvoiceResponse,
	insertInvoiceFromAttach,
} from "@/internal/invoices/invoiceUtils.js";
import {
	attachToInsertParams,
	isOneOff,
} from "@/internal/products/productUtils.js";
import type { AutumnContext } from "../../../../../honoUtils/HonoEnv.js";
import {
	attachParamsToCurCusProduct,
	paramsToCurSub,
	paramsToCurSubSchedule,
} from "../../attachUtils/convertAttachParams.js";
import { paramsToSubItems } from "../../mergeUtils/paramsToSubItems.js";
import { handleUpgradeFlowSchedule } from "./handleUpgradeFlowSchedule.js";
import { updateStripeSub2 } from "./updateStripeSub2.js";
import { shouldCancelSub } from "./upgradeFlowUtils.js";

export const handleUpgradeFlow = async ({
	ctx,
	attachParams,
	config,
	branch,
	fromMigration = false,
}: {
	ctx: AutumnContext;
	attachParams: AttachParams;
	config: AttachConfig;
	branch: AttachBranch;
	fromMigration?: boolean;
}) => {
	const curCusProduct = attachParamsToCurCusProduct({ attachParams });

	const curSub = await paramsToCurSub({ attachParams });

	const { logger, db } = ctx;

	if (curCusProduct?.api_semver) {
		attachParams.apiVersion = curCusProduct.api_semver;
	}

	let sub = curSub;
	let latestInvoice: Stripe.Invoice | undefined;

	const itemSet = await getStripeSubItems2({
		attachParams,
		config,
	});

	const newItemSet = await paramsToSubItems({
		ctx,
		sub: curSub,
		attachParams,
		config,
	});

	const { subItems } = newItemSet;

	const products =
		attachParams.fromCancel && attachParams.cusProduct
			? [cusProductToProduct({ cusProduct: attachParams.cusProduct })]
			: attachParams.products;

	for (const product of products) {
		if (
			product.is_add_on ||
			branch === AttachBranch.NewVersion ||
			branch === AttachBranch.SameCustomEnts ||
			fromMigration
		)
			continue;

		const { curScheduledProduct } = getExistingCusProducts({
			product,
			cusProducts: attachParams.cusProducts,
			internalEntityId: attachParams.internalEntityId,
		});

		if (curScheduledProduct) {
			await CusProductService.delete({
				db,
				cusProductId: curScheduledProduct.id,
			});
		}
	}

	let canceled = false;

	if (branch === AttachBranch.SameCustomEnts) {
		config.proration = ProrationBehavior.None;
	}

	if (!curSub) {
		logger.info("UPGRADE FLOW: no sub (from cancel maybe...?)");
		// Do something about current sub...
	} else if (shouldCancelSub({ sub: curSub, newSubItems: subItems })) {
		logger.info(
			`UPGRADE FLOW: canceling sub ${curSub.id}, proration: ${config.proration}`,
		);
		canceled = true;
		const { stripeCli } = attachParams;

		// // Set lock to prevent webhook handler from processing this cancellation
		// await setStripeSubscriptionLock({
		// 	stripeSubscriptionId: curSub.id,
		// 	lockedAtMs: Date.now(),
		// });

		await stripeCli.subscriptions.cancel(curSub.id, {
			prorate: config.proration === ProrationBehavior.Immediately,
			invoice_now: config.proration === ProrationBehavior.Immediately,
			cancellation_details: {
				comment: "autumn_cancel",
			},
		});
	} else if (subItems.length > 0) {
		logger.info(`UPGRADE FLOW, updating sub ${curSub.id}`);
		itemSet.subItems = subItems;

		const res = await updateStripeSub2({
			ctx,
			attachParams,
			config,
			curSub: curSub,
			itemSet,
			branch,
		});

		if (res?.latestInvoice) {
			logger.info(`UPGRADE FLOW: inserting invoice ${res.latestInvoice.id}`);
			await insertInvoiceFromAttach({
				db,
				attachParams,
				stripeInvoice: res.latestInvoice,
				logger,
			});
		}

		if (res?.url) {
			return AttachFunctionResponseSchema.parse({
				checkout_url: res.url,
				code: SuccessCode.InvoiceActionRequired,
				message: `Payment action required`,
			});
		}

		const schedule = await paramsToCurSubSchedule({ attachParams });

		if (schedule) {
			let removeCusProducts: FullCusProduct[] | undefined;
			let addNewProducts = true;
			if (fromMigration) {
				// 1. If customer product is canceling, already removed from schedule.
				if (isCustomerProductCanceling(curCusProduct)) {
					removeCusProducts = [];
				} else {
					removeCusProducts = [curCusProduct!];
				}

				// For adding the new product to the schedule, we need to add it ONLY if the customer product is not canceling.
				if (isCustomerProductCanceling(curCusProduct)) {
					addNewProducts = false;
				}
			}

			await handleUpgradeFlowSchedule({
				ctx,
				attachParams,
				config,
				schedule,
				curSub,
				removeCusProducts,
				addNewProducts,
			});
		}

		attachParams.replaceables = res.replaceables || [];
		sub = res.updatedSub;
		latestInvoice = res.latestInvoice || undefined;
	}

	if (
		curCusProduct &&
		!isOneOff(cusProductToPrices({ cusProduct: curCusProduct }))
	) {
		logger.info(`UPGRADE FLOW: expiring previous cus product`);
		await CusProductService.update({
			db,
			cusProductId: curCusProduct.id,
			updates: {
				subscription_ids: canceled ? undefined : [],
				status: CusProductStatus.Expired,
				ended_at: Date.now(),
			},
		});

		try {
			await addProductsUpdatedWebhookTask({
				ctx,
				internalCustomerId: curCusProduct.internal_customer_id,
				org: attachParams.org,
				env: attachParams.customer.env,
				customerId:
					attachParams.customer.id || attachParams.customer.internal_id,
				scenario: AttachScenario.Expired,
				cusProduct: curCusProduct,
			});
		} catch (error) {
			logger.error("UPGRADE FLOW: failed to add to webhook queue", { error });
		}
	}

	if (attachParams.products.length > 0) {
		logger.info(`UPGRADE FLOW: creating new cus product`);
		const anchorToUnix = sub ? getEarliestPeriodEnd({ sub }) * 1000 : undefined;

		let canceledAt: number | undefined;
		let endedAt: number | undefined;
		if (sub && isStripeSubscriptionCanceled(sub)) {
			canceledAt = sub.canceled_at
				? sub.canceled_at * 1000
				: curCusProduct?.canceled_at || undefined;
		}

		if (fromMigration && curCusProduct?.canceled_at) {
			canceledAt = curCusProduct.canceled_at;
			endedAt = curCusProduct.ended_at ?? undefined;
		}

		await createFullCusProduct({
			db,
			attachParams: attachToInsertParams(
				attachParams,
				attachParams.products[0],
			),
			subscriptionIds: curCusProduct?.subscription_ids || [],
			disableFreeTrial: config.disableTrial,
			carryExistingUsages: config.carryUsage,
			carryOverTrial: config.carryTrial,
			anchorToUnix: anchorToUnix,
			scenario: AttachScenario.Upgrade,
			canceledAt: canceledAt,
			endedAt: endedAt,
			subscriptionStatus:
				sub?.status === "past_due" ? CusProductStatus.PastDue : undefined,
			logger,
		});
	}

	return AttachFunctionResponseSchema.parse({
		code: SuccessCode.UpgradedToNewProduct,
		message: `Successfully updated product`,
		invoice: attachParams.invoiceOnly
			? attachToInvoiceResponse({ invoice: latestInvoice || undefined })
			: undefined,
	});
};
