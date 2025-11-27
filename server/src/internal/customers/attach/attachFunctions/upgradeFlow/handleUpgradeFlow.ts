import {
	AttachBranch,
	type AttachConfig,
	AttachFunctionResponseSchema,
	AttachScenario,
	CusProductStatus,
	cusProductToProduct,
	ProrationBehavior,
	SuccessCode,
} from "@autumn/shared";
import type Stripe from "stripe";
import { getEarliestPeriodEnd } from "@/external/stripe/stripeSubUtils/convertSubUtils.js";
import { getStripeSubItems2 } from "@/external/stripe/stripeSubUtils/getStripeSubItems.js";
import { subIsCanceled } from "@/external/stripe/stripeSubUtils.js";
import { addProductsUpdatedWebhookTask } from "@/internal/analytics/handlers/handleProductsUpdated.js";
import { createFullCusProduct } from "@/internal/customers/add-product/createFullCusProduct.js";
import { type AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";
import { getExistingCusProducts } from "@/internal/customers/cusProducts/cusProductUtils/getExistingCusProducts.js";
import {
	attachToInvoiceResponse,
	insertInvoiceFromAttach,
} from "@/internal/invoices/invoiceUtils.js";
import { attachToInsertParams } from "@/internal/products/productUtils.js";
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
}: {
	ctx: AutumnContext;
	attachParams: AttachParams;
	config: AttachConfig;
	branch: AttachBranch;
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
			branch === AttachBranch.SameCustomEnts
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

		// await logPhaseItems({
		//   db: req.db,
		//   items: itemSet.subItems,
		// });

		const res = await updateStripeSub2({
			ctx,
			attachParams,
			config,
			curSub: curSub,
			itemSet,
			fromCreate: attachParams.products.length === 0, // just for now, if no products, it comes from cancel product...
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

		const schedule = await paramsToCurSubSchedule({ attachParams });

		if (schedule) {
			await handleUpgradeFlowSchedule({
				ctx,
				attachParams,
				config,
				schedule,
				curSub,
			});
		}

		attachParams.replaceables = res.replaceables || [];
		sub = res.updatedSub;
		latestInvoice = res.latestInvoice || undefined;
	}

	if (curCusProduct) {
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
		console.log("Sub status:", sub?.status);

		let canceledAt: number | undefined;
		if (sub && subIsCanceled({ sub })) {
			canceledAt = sub.canceled_at
				? sub.canceled_at * 1000
				: curCusProduct?.canceled_at || undefined;
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

	// if (res) {
	// 	if (req.apiVersion.gte(ApiVersion.V1_1)) {
	// 		res.status(200).json(
	// 			AttachResultSchema.parse({
	// 				customer_id: attachParams.customer.id,
	// 				product_ids: attachParams.products.map((p) => p.id),
	// 				invoice: attachParams.invoiceOnly
	// 					? attachToInvoiceResponse({ invoice: latestInvoice || undefined })
	// 					: undefined,
	// 				code: "updated_product_successfully",
	// 				message: `Successfully updated product`,
	// 			}),
	// 		);
	// 	} else {
	// 		res.status(200).json({
	// 			success: true,
	// 			message: `Successfully updated product`,
	// 		});
	// 	}
	// }
};
