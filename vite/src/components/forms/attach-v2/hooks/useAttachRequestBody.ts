import type {
	AttachParamsV0,
	AttachParamsV0Input,
	BillingBehavior,
	FreeTrialDuration,
	PlanTiming,
	ProductItem,
	ProductItemInterval,
	ProductV2,
} from "@autumn/shared";
import { useMemo } from "react";
import { getFreeTrial } from "@/components/forms/update-subscription-v2/utils/getFreeTrial";
import { convertPrepaidOptionsToFeatureOptions } from "@/utils/billing/prepaidQuantityUtils";
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
