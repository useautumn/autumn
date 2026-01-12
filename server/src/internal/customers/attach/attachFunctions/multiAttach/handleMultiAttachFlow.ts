import {
	type AttachBodyV0,
	type AttachBranch,
	type AttachConfig,
	AttachFunctionResponseSchema,
	AttachScenario,
	CusProductStatus,
	isTrialing,
	SuccessCode,
} from "@autumn/shared";
import type Stripe from "stripe";
import { getLatestPeriodEnd } from "@/external/stripe/stripeSubUtils/convertSubUtils.js";
import { createFullCusProduct } from "@/internal/customers/add-product/createFullCusProduct.js";
import type { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";

import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";
import {
	attachToInvoiceResponse,
	insertInvoiceFromAttach,
} from "@/internal/invoices/invoiceUtils.js";
import { attachToInsertParams } from "@/internal/products/productUtils.js";
import type { AutumnContext } from "../../../../../honoUtils/HonoEnv.js";
import {
	getCustomerSub,
	paramsToCurSubSchedule,
} from "../../attachUtils/convertAttachParams.js";
import { handleMultiAttachErrors } from "../../attachUtils/handleAttachErrors/handleMultiAttachErrors.js";
import { paramsToSubItems } from "../../mergeUtils/paramsToSubItems.js";
import { createStripeSub2 } from "../addProductFlow/createStripeSub2.js";
import { handleUpgradeFlowSchedule } from "../upgradeFlow/handleUpgradeFlowSchedule.js";
import { updateStripeSub2 } from "../upgradeFlow/updateStripeSub2.js";
import {
	getAddAndRemoveProducts,
	getProdListWithoutEntities,
} from "./getAddAndRemoveProducts.js";

export const handleMultiAttachFlow = async ({
	ctx,
	attachParams,
	attachBody,
	branch,
	config,
}: {
	ctx: AutumnContext;
	attachParams: AttachParams;
	attachBody: AttachBodyV0;
	branch: AttachBranch;
	config: AttachConfig;
}) => {
	await handleMultiAttachErrors({ attachParams, attachBody, branch });
	const { db, logger } = ctx;
	const { stripeCli } = attachParams;
	const productsList = attachParams.productsList!;

	let { sub: curSub, cusProduct: mergeCusProduct } = await getCustomerSub({
		attachParams,
	});
	let latestInvoice: Stripe.Invoice | null = null;

	const { removeCusProducts, itemSet, expireCusProducts } =
		await getAddAndRemoveProducts({
			attachParams,
			config,
		});

	const mergedItemSet = await paramsToSubItems({
		ctx,
		attachParams,
		config,
		removeCusProducts,
		addItemSet: itemSet,
		sub: curSub,
	});

	itemSet.subItems = mergedItemSet.subItems;

	if (!curSub) {
		console.log("MULTI ATTACH FLOW, NO SUB, CREATING NEW");
		const newSub = await createStripeSub2({
			db,
			attachParams,
			config,
			stripeCli,
			itemSet,
			logger,
		});

		if (config?.invoiceCheckout) {
			return {
				invoices: [newSub.latest_invoice as Stripe.Invoice],
				subs: [newSub],
				anchorToUnix: getLatestPeriodEnd({ sub: newSub }) * 1000,
				config,
			};
		}
		curSub = newSub;
		latestInvoice = newSub.latest_invoice as Stripe.Invoice;
		// Do something about current sub...
	} else if (itemSet.subItems.length > 0) {
		console.log(`MULTI ATTACH FLOW, UPDATING SUB ${curSub!.id}`);
		config.disableTrial = true;

		const updateResult = await updateStripeSub2({
			ctx,
			attachParams,
			config,
			curSub: curSub!,
			itemSet,
			branch,
		});

		// TODO: Add these missing functions or remove if not needed
		const schedule = await paramsToCurSubSchedule({ attachParams });
		if (schedule) {
			await handleUpgradeFlowSchedule({
				ctx,
				attachParams,
				config,
				schedule,
				curSub,
				removeCusProducts,
			});
		}

		attachParams.replaceables = updateResult.replaceables || [];
		curSub = updateResult.updatedSub;
		latestInvoice = updateResult.latestInvoice;
	}

	for (const cusProduct of removeCusProducts) {
		if (cusProduct.status === CusProductStatus.Scheduled) {
			await CusProductService.delete({
				db,
				cusProductId: cusProduct.id,
			});
		}
	}

	for (const cusProduct of expireCusProducts) {
		await CusProductService.update({
			db,
			cusProductId: cusProduct.id,
			updates: {
				status: CusProductStatus.Expired,
			},
		});
	}

	if (latestInvoice) {
		await insertInvoiceFromAttach({
			db,
			attachParams,
			stripeInvoice: latestInvoice,
			logger,
		});
	}

	// Expire all existing cus products at the customer level
	const batchInsert: unknown[] = [];
	const newProdList = getProdListWithoutEntities({
		attachParams,
		productsList,
	});
	for (const productOptions of newProdList) {
		const product = attachParams.products.find(
			(p) => p.id === productOptions.product_id,
		)!;

		if (productOptions.quantity === 0) continue;

		const anchorToUnix = curSub
			? getLatestPeriodEnd({ sub: curSub! }) * 1000
			: undefined;

		batchInsert.push(
			createFullCusProduct({
				db,
				attachParams: attachToInsertParams(
					attachParams,
					product,
					productOptions.entity_id || undefined,
				),
				subscriptionIds: curSub ? [curSub.id] : undefined,
				anchorToUnix,
				scenario: AttachScenario.New,
				logger,
				productOptions,
				trialEndsAt:
					mergeCusProduct && isTrialing({ cusProduct: mergeCusProduct })
						? mergeCusProduct?.trial_ends_at || undefined
						: undefined,
			}),
		);
	}

	console.log("Running multi attach flow!");
	return AttachFunctionResponseSchema.parse({
		message: `Successfully created subscriptions and attached ${attachParams.products.map((p) => p.name).join(", ")} to ${attachParams.customer.name}`,
		code: SuccessCode.NewProductAttached,
		invoice: attachParams.invoiceOnly
			? attachToInvoiceResponse({ invoice: latestInvoice })
			: undefined,
	});
	// if (res) {
	// 	const invoice = latestInvoice;
	// 	res.status(200).json(
	// 		AttachResultSchema.parse(
	// 			AttachResultSchema.parse({
	// 				message: `Successfully created subscriptions and attached ${attachParams.products.map((p) => p.name).join(", ")} to ${attachParams.customer.name}`,
	// 				code: SuccessCode.NewProductAttached,
	// 				product_ids: attachParams.products.map((p) => p.id),
	// 				customer_id:
	// 					attachParams.customer.id || attachParams.customer.internal_id,
	// 				invoice: attachParams.invoiceOnly
	// 					? attachToInvoiceResponse({ invoice })
	// 					: undefined,
	// 			}),
	// 		),
	// 	);
	// }
};
