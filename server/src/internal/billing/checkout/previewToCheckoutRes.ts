import {
	type AttachBranch,
	type AttachPreview,
	type CheckoutLineV0,
	CheckoutResponseV0Schema,
	cusProductToEnts,
	cusProductToPrices,
	cusProductToProduct,
	isUsagePrice,
	type PreviewLineItem,
	toProductItem,
	UsageModel,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import {
	attachParamsToProduct,
	attachParamToCusProducts,
} from "@/internal/customers/attach/attachUtils/convertAttachParams.js";
import type { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import { getPriceEntitlement } from "@/internal/products/prices/priceUtils.js";
import { isPriceItem } from "@/internal/products/product-items/productItemUtils/getItemType.js";
import {
	getProductItemResponse,
	getProductResponse,
} from "@/internal/products/productUtils/productResponseUtils/getProductResponse.js";
import { notNullish } from "@/utils/genUtils.js";
import type { ExtendedRequest } from "@/utils/models/Request.js";

export const previewToCheckoutRes = async ({
	req,
	attachParams,
	preview,
	branch,
}: {
	req: ExtendedRequest;
	attachParams: AttachParams;
	branch: AttachBranch;
	preview: AttachPreview;
}) => {
	const { logger, features, org } = req;
	const product = attachParamsToProduct({ attachParams });

	const { curCusProduct } = attachParamToCusProducts({ attachParams });
	const curPrices = curCusProduct
		? cusProductToPrices({ cusProduct: curCusProduct })
		: [];
	const curEnts = curCusProduct
		? cusProductToEnts({ cusProduct: curCusProduct })
		: [];

	const newPrices = attachParams.prices;
	const newEnts = attachParams.entitlements;
	const allPrices = [...curPrices, ...newPrices];
	const allEnts = [...curEnts, ...newEnts];
	let lines: CheckoutLineV0[] = [];

	if (preview.due_today && preview.due_today.line_items.length > 0) {
		lines = preview.due_today.line_items
			.map((li: PreviewLineItem) => {
				const price = allPrices.find((p) => p.id === li.price_id);

				if (!price) {
					return null;
				}

				const ent = getPriceEntitlement(price, allEnts);

				return {
					description: li.description || "",
					amount: li.amount || 0,
					item: getProductItemResponse({
						item: toProductItem({ ent, price }),
						features,
						currency: org.default_currency,
						withDisplay: true,
						options: attachParams.optionsList,
					}),
				};
			})
			.filter(notNullish) as CheckoutLineV0[];
	}

	const curProduct = curCusProduct
		? await getProductResponse({
				product: cusProductToProduct({ cusProduct: curCusProduct }),
				features,
				currency: org.default_currency,
				options: curCusProduct?.options,
			})
		: null;

	const newProduct = await getProductResponse({
		product,
		features,
		currency: org.default_currency,
		options: attachParams.optionsList,
		fullCus: attachParams.customer,
	});
	const total = lines.reduce((acc, line) => acc + line.amount, 0);

	let nextCycle:
		| {
				starts_at: number;
				total: number;
		  }
		| undefined;

	if (
		notNullish(preview.due_next_cycle) &&
		notNullish(preview.due_next_cycle.due_at)
	) {
		let total = newProduct.items
			.reduce((acc, item) => {
				if (item.usage_model === UsageModel.PayPerUse) {
					return acc;
				}

				if (isPriceItem(item)) {
					return acc.plus(item.price || 0);
				}

				const prepaidQuantity =
					attachParams.optionsList.find((o) => o.feature_id === item.feature_id)
						?.quantity || 0;

				return acc.plus(prepaidQuantity * (item.price || 0));
			}, new Decimal(0))
			.toNumber();

		try {
			if (
				preview.due_next_cycle?.line_items &&
				preview.due_next_cycle.line_items.length > 0
			) {
				total = preview.due_next_cycle.line_items
					.reduce((acc, item) => {
						return acc.plus(item.amount || 0);
					}, new Decimal(0))
					.toNumber();
			}
		} catch (error) {
			logger.error("Error calculating total for due next cycle", {
				error,
			});
		}

		nextCycle = {
			starts_at: preview.due_next_cycle.due_at,
			total: total,
		};
	}

	// Options
	const options = attachParams.optionsList
		.map((o) => {
			const price = allPrices.find((p) => {
				if (isUsagePrice({ price: p })) {
					return (
						p.config.internal_feature_id === o.internal_feature_id ||
						p.config.feature_id === o.feature_id
					);
				}
				return false;
			});

			if (!price) return undefined;

			return {
				feature_id: o.feature_id,
				quantity: o.quantity * (price.config.billing_units || 1),
			};
		})
		.filter(notNullish);

	return CheckoutResponseV0Schema.parse({
		customer_id: attachParams.customer.id || attachParams.customer.internal_id,
		lines,
		product: newProduct,
		current_product: curProduct,
		total: new Decimal(total).toDecimalPlaces(2).toNumber(),
		currency: org.default_currency || "usd",
		next_cycle_at: notNullish(preview.due_next_cycle)
			? preview.due_next_cycle.due_at
			: null,
		next_cycle: nextCycle,
		options,
	});
};
