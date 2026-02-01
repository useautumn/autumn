import {
	type AttachParamsV0,
	type AttachParamsV0Input,
	type FeatureOptions,
	type ProductItem,
	ProductItemInterval,
	type ProductV2,
	UsageModel,
} from "@autumn/shared";
import Decimal from "decimal.js";
import { useMemo } from "react";

interface UseAttachRequestBodyParams {
	customerId: string | undefined;
	entityId: string | undefined;
	product: ProductV2 | undefined;
	prepaidOptions: Record<string, number>;
	items: ProductItem[] | null;
	version: number | undefined;
}

function convertPrepaidOptionsToFeatureOptions({
	prepaidOptions,
	product,
}: {
	prepaidOptions: Record<string, number>;
	product: ProductV2 | undefined;
}): FeatureOptions[] | undefined {
	if (!product || Object.keys(prepaidOptions).length === 0) {
		return undefined;
	}

	const options: FeatureOptions[] = [];

	for (const [featureId, quantity] of Object.entries(prepaidOptions)) {
		const prepaidItem = product.items.find(
			(item) =>
				item.feature_id === featureId &&
				item.usage_model === UsageModel.Prepaid,
		);

		if (prepaidItem) {
			options.push({
				feature_id: featureId,
				quantity: new Decimal(quantity || 0)
					.mul(prepaidItem.billing_units || 1)
					.toNumber(),
			});
		} else {
			options.push({
				feature_id: featureId,
				quantity: quantity,
			});
		}
	}

	return options.length > 0 ? options : undefined;
}

export function useAttachRequestBody({
	customerId,
	entityId,
	product,
	prepaidOptions,
	items,
	version,
}: UseAttachRequestBodyParams) {
	const requestBody = useMemo((): AttachParamsV0 | null => {
		if (!customerId || !product) {
			return null;
		}

		const options = convertPrepaidOptionsToFeatureOptions({
			prepaidOptions,
			product,
		});

		const body: AttachParamsV0Input = {
			customer_id: customerId,
			product_id: product.id,
			redirect_mode: "if_required",
		};

		if (entityId) {
			body.entity_id = entityId;
		}

		if (options && options.length > 0) {
			body.options = options;
		}

		if (items && items.length > 0) {
			body.items = items.map((item) => ({
				...item,
				interval: item.interval || ProductItemInterval.Month,
			}));
		}

		if (version !== undefined) {
			body.version = version;
		}

		return body;
	}, [customerId, entityId, product, prepaidOptions, items, version]);

	const buildRequestBody = useMemo(
		() =>
			({
				useInvoice,
				enableProductImmediately,
			}: {
				useInvoice?: boolean;
				enableProductImmediately?: boolean;
			} = {}): AttachParamsV0 | null => {
				if (!requestBody) return null;

				const body = { ...requestBody };

				if (useInvoice) {
					body.invoice = true;
					body.enable_product_immediately = enableProductImmediately;
					body.finalize_invoice = false;
				}

				return body;
			},
		[requestBody],
	);

	return { requestBody, buildRequestBody };
}
