// import {
// 	type AttachBodyV0,
// 	AttachBodySchema,
// 	AttachFunction,
// 	type FeatureOptions,
// } from "@autumn/shared";
// import { attachParamsToPreview } from "@/internal/billing/attachPreview/attachParamsToPreview.js";
// import { handleCreateCheckout } from "@/internal/customers/add-product/handleCreateCheckout.js";
// import { handleCreateInvoiceCheckout } from "@/internal/customers/add-product/handleCreateInvoiceCheckout.js";
// import {
// 	checkStripeConnections,
// 	handlePrepaidErrors,
// } from "@/internal/customers/attach/attachRouter.js";
// import { getAttachParams } from "@/internal/customers/attach/attachUtils/attachParams/getAttachParams.js";
// import { attachParamsToProduct } from "@/internal/customers/attach/attachUtils/convertAttachParams.js";
// import { getAttachBranch } from "@/internal/customers/attach/attachUtils/getAttachBranch.js";
// import { getAttachConfig } from "@/internal/customers/attach/attachUtils/getAttachConfig.js";
// import { getAttachFunction } from "@/internal/customers/attach/attachUtils/getAttachFunction.js";
// import { handleCheckoutErrors } from "@/internal/customers/attach/attachUtils/handleAttachErrors/handleCheckoutErrors.js";
// import type { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
// import { priceToFeature } from "@/internal/products/prices/priceUtils/convertPrice.js";
// import { isPrepaidPrice } from "@/internal/products/prices/priceUtils/usagePriceUtils/classifyUsagePrice.js";
// import { getPriceOptions } from "@/internal/products/prices/priceUtils.js";
// import type {
// 	ExtendedRequest,
// 	ExtendedResponse,
// } from "@/utils/models/Request.js";
// import { routeHandler } from "@/utils/routerUtils.js";
// import type { AutumnContext } from "../../../honoUtils/HonoEnv.js";
// import { getHasProrations } from "./getHasProrations.js";
// import { previewToCheckoutRes } from "./previewToCheckoutRes.js";

// const getAttachVars = async ({
// 	req,
// 	attachBody,
// }: {
// 	req: ExtendedRequest;
// 	attachBody: AttachBodyV0;
// }) => {
// 	const { attachParams } = await getAttachParams({
// 		req,
// 		attachBody,
// 	});

// 	const branch = await getAttachBranch({
// 		req,
// 		attachBody,
// 		attachParams,
// 		fromPreview: true,
// 	});

// 	const { flags, config } = await getAttachConfig({
// 		req,
// 		attachParams,
// 		attachBody,
// 		branch,
// 	});

// 	const func = await getAttachFunction({
// 		branch,
// 		attachParams,
// 		attachBody,
// 		config,
// 	});

// 	return {
// 		attachParams,
// 		flags,
// 		branch,
// 		config,
// 		func,
// 	};
// };

// const getCheckoutOptions = async ({
// 	req,
// 	attachParams,
// }: {
// 	req: ExtendedRequest;
// 	attachParams: AttachParams;
// }) => {
// 	const product = attachParamsToProduct({ attachParams });
// 	const prepaidPrices = product.prices.filter((p) =>
// 		isPrepaidPrice({ price: p }),
// 	);

// 	const newOptions: FeatureOptions[] = structuredClone(
// 		attachParams.optionsList,
// 	);
// 	for (const prepaidPrice of prepaidPrices) {
// 		const feature = priceToFeature({
// 			price: prepaidPrice,
// 			features: req.features,
// 		});
// 		const option = getPriceOptions(prepaidPrice, attachParams.optionsList);
// 		if (!option) {
// 			newOptions.push({
// 				feature_id: feature?.id ?? "",
// 				internal_feature_id: feature?.internal_id,
// 				quantity: 1,
// 			});
// 		}
// 	}

// 	attachParams.optionsList = newOptions;
// 	return newOptions;
// };

// export const handleCheckout = (req: any, res: any) =>
// 	routeHandler({
// 		req,
// 		res,
// 		action: "attach-preview",
// 		handler: async (req: ExtendedRequest, res: ExtendedResponse) => {
// 			const { logger } = req;

// 			const attachBody = AttachBodySchema.parse(req.body);

// 			const { attachParams, branch, func, config } = await getAttachVars({
// 				req,
// 				attachBody,
// 			});

// 			let checkoutUrl = null;

// 			handleCheckoutErrors({
// 				attachParams,
// 				branch,
// 			});

// 			if (func === AttachFunction.CreateCheckout) {
// 				await checkStripeConnections({
// 					ctx: req as AutumnContext,
// 					attachParams,
// 					createCus: true,
// 					useCheckout: true,
// 				});

// 				await handlePrepaidErrors({
// 					attachParams,
// 					config,
// 					useCheckout: config.onlyCheckout,
// 				});

// 				if (config.invoiceCheckout) {
// 					const result = await handleCreateInvoiceCheckout({
// 						req,
// 						attachParams,
// 						attachBody,
// 						branch,
// 						config,
// 					});

// 					checkoutUrl = result?.invoices?.[0]?.hosted_invoice_url;
// 				} else {
// 					const checkout = await handleCreateCheckout({
// 						req,
// 						res,
// 						attachParams,
// 						config,
// 						returnCheckout: true,
// 					});

// 					checkoutUrl = checkout?.url;
// 				}
// 			}

// 			console.log(`Branch: ${branch}, Func: ${func}`);

// 			await getCheckoutOptions({
// 				req,
// 				attachParams,
// 			});

// 			const preview = await attachParamsToPreview({
// 				req,
// 				attachParams,
// 				logger,
// 				attachBody,
// 				withPrepaid: true,
// 			});

// 			const checkoutRes = await previewToCheckoutRes({
// 				req,
// 				attachParams,
// 				preview,
// 				branch,
// 			});

// 			// Get has prorations
// 			const hasProrations = await getHasProrations({
// 				req,
// 				branch,
// 				attachParams,
// 			});

// 			res.status(200).json({
// 				...checkoutRes,
// 				url: checkoutUrl,
// 				has_prorations: hasProrations,
// 			});

// 			return;
// 		},
// 	});
