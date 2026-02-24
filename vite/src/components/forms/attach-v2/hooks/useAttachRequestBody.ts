import {
	type AttachParamsV0,
	type AttachParamsV0Input,
	type BillingBehavior,
	type FeatureOptions,
	type FreeTrialDuration,
	type PlanTiming,
	type ProductItem,
	type ProductItemInterval,
	type ProductV2,
	UsageModel,
} from "@autumn/shared";
import Decimal from "decimal.js";
import { useMemo } from "react";
import { getFreeTrial } from "@/components/forms/update-subscription-v2/utils/getFreeTrial";
import { normalizeAttachBillingBehavior } from "../utils/attachBillingBehaviorRules";
import {
	type FormDiscount,
	filterValidDiscounts,
} from "../utils/discountUtils";

export interface BuildAttachRequestBodyParams {
	customerId: string | undefined;
	entityId: string | undefined;
	product: ProductV2 | undefined;
	prepaidOptions: Record<string, number>;
	items: ProductItem[] | null;
	version: number | undefined;
	trialLength: number | null;
	trialDuration: FreeTrialDuration;
	trialEnabled: boolean;
	trialCardRequired: boolean;
	planSchedule: PlanTiming | null;
	billingBehavior: BillingBehavior | null;
	newBillingSubscription: boolean;
	discounts: FormDiscount[];
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

/** Pure function to build the attach request body. Extracted for testability. */
export function buildAttachRequestBody({
	customerId,
	entityId,
	product,
	prepaidOptions,
	items,
	version,
	trialLength,
	trialDuration,
	trialEnabled,
	trialCardRequired,
	planSchedule,
	billingBehavior,
	newBillingSubscription,
	discounts,
}: BuildAttachRequestBodyParams): AttachParamsV0 | null {
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

	if (items !== null) {
		body.items = items.map((item) => ({
			...item,
			interval: (item.interval ?? null) as ProductItemInterval | null,
		}));
	}

	if (version !== undefined) {
		body.version = version;
	}

	const freeTrial = getFreeTrial({
		removeTrial: false,
		trialLength,
		trialDuration,
		trialEnabled,
		trialCardRequired,
	});
	if (freeTrial !== undefined) {
		body.free_trial = freeTrial;
	}

	if (planSchedule) {
		body.plan_schedule = planSchedule;
	}

	const normalizedBillingBehavior = normalizeAttachBillingBehavior({
		billingBehavior,
		newBillingSubscription,
	});

	if (normalizedBillingBehavior) {
		body.billing_behavior = normalizedBillingBehavior;
	}

	if (newBillingSubscription) {
		body.new_billing_subscription = true;
	}

	const validDiscounts = filterValidDiscounts(discounts);
	if (validDiscounts.length > 0) {
		body.discounts = validDiscounts;
	}

	return body as AttachParamsV0;
}

export function useAttachRequestBody(params: BuildAttachRequestBodyParams) {
	const {
		customerId,
		entityId,
		product,
		prepaidOptions,
		items,
		version,
		trialLength,
		trialDuration,
		trialEnabled,
		trialCardRequired,
		planSchedule,
		billingBehavior,
		newBillingSubscription,
		discounts,
	} = params;

	const requestBody = useMemo(
		() =>
			buildAttachRequestBody({
				customerId,
				entityId,
				product,
				prepaidOptions,
				items,
				version,
				trialLength,
				trialDuration,
				trialEnabled,
				trialCardRequired,
				planSchedule,
				billingBehavior,
				newBillingSubscription,
				discounts,
			}),
		[
			customerId,
			entityId,
			product,
			prepaidOptions,
			items,
			version,
			trialLength,
			trialDuration,
			trialEnabled,
			trialCardRequired,
			planSchedule,
			billingBehavior,
			newBillingSubscription,
			discounts,
		],
	);

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
