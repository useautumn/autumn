import type {
	AttachParamsV0,
	BillingBehavior,
	FreeTrialDuration,
	PlanTiming,
	ProductItem,
	ProductItemInterval,
	ProductV2,
	RedirectMode,
} from "@autumn/shared";
import { useMemo } from "react";
import { getFreeTrial } from "@/components/forms/update-subscription-v2/utils/getFreeTrial";
import { convertPrepaidOptionsToFeatureOptions } from "@/utils/billing/prepaidQuantityUtils";
import type { FormCustomLineItem } from "../attachFormSchema";
import { normalizeAttachProrationBehavior } from "../utils/attachProrationBehaviorRules";
import {
	type FormDiscount,
	filterValidDiscounts,
} from "../utils/discountUtils";

export interface BuildAttachRequestBodyParams {
	customerId: string | undefined;
	entityId: string | undefined;
	product: ProductV2 | undefined;
	prepaidOptions: Record<string, number | undefined>;
	items: ProductItem[] | null;
	version: number | undefined;
	trialLength: number | null;
	trialDuration: FreeTrialDuration;
	trialEnabled: boolean;
	trialCardRequired: boolean;
	planSchedule: PlanTiming | null;
	startDate: number | null;
	prorationBehavior: BillingBehavior | null;
	redirectMode: RedirectMode;
	newBillingSubscription: boolean;
	resetBillingCycle: boolean;
	discounts: FormDiscount[];
	noBillingChanges: boolean;
	carryOverBalances: boolean;
	carryOverBalanceFeatureIds: string[];
	carryOverUsages: boolean;
	carryOverUsageFeatureIds: string[];
	customLineItems: FormCustomLineItem[];
	isFreeToPaidTransition: boolean;
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
	startDate,
	prorationBehavior,
	redirectMode,
	newBillingSubscription,
	resetBillingCycle,
	discounts,
	noBillingChanges,
	carryOverBalances,
	carryOverBalanceFeatureIds = [],
	carryOverUsages,
	carryOverUsageFeatureIds = [],
	customLineItems,
	isFreeToPaidTransition,
}: BuildAttachRequestBodyParams): AttachParamsV0 | null {
	if (!customerId || !product) {
		return null;
	}

	const options = convertPrepaidOptionsToFeatureOptions({
		prepaidOptions,
		product,
	});

	const body: Record<string, unknown> = {
		customer_id: customerId,
		product_id: product.id,
		redirect_mode: redirectMode,
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
	} else if (!trialEnabled) {
		body.free_trial = null;
	}

	if (planSchedule) {
		body.plan_schedule = planSchedule;
	}

	// Skip when other form state makes start_date invalid — server would reject anyway,
	// and form values can carry stale dates after the picker is hidden.
	const startDateAllowed = !trialEnabled && planSchedule !== "end_of_cycle";
	if (startDate && startDateAllowed) {
		body.start_date = startDate;
	}

	const normalizedProrationBehavior = normalizeAttachProrationBehavior({
		prorationBehavior,
		newBillingSubscription,
		blocksNextCycleOnly: isFreeToPaidTransition,
	});

	if (normalizedProrationBehavior) {
		body.billing_behavior = normalizedProrationBehavior;
	}

	if (newBillingSubscription) {
		body.new_billing_subscription = true;
	}

	if (resetBillingCycle) {
		body.billing_cycle_anchor = "now";
	}

	const validDiscounts = filterValidDiscounts(discounts);
	if (validDiscounts.length > 0) {
		body.discounts = validDiscounts;
	}

	if (noBillingChanges) {
		body.no_billing_changes = true;
	}

	if (carryOverBalances) {
		body.carry_over_balances =
			carryOverBalanceFeatureIds.length > 0
				? { enabled: true, feature_ids: carryOverBalanceFeatureIds }
				: { enabled: true };
	}

	if (carryOverUsages) {
		body.carry_over_usages =
			carryOverUsageFeatureIds.length > 0
				? { enabled: true, feature_ids: carryOverUsageFeatureIds }
				: { enabled: true };
	}

	const validLineItems = customLineItems.filter(
		(item) => item.amount !== "" && item.description.trim() !== "",
	);
	if (validLineItems.length > 0) {
		body.custom_line_items = validLineItems.map(({ amount, description }) => ({
			amount: Number(amount),
			description,
		}));
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
		startDate,
		prorationBehavior,
		redirectMode,
		newBillingSubscription,
		resetBillingCycle,
		discounts,
		noBillingChanges,
		carryOverBalances,
		carryOverBalanceFeatureIds,
		carryOverUsages,
		carryOverUsageFeatureIds,
		customLineItems,
		isFreeToPaidTransition,
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
				startDate,
				prorationBehavior,
				redirectMode,
				newBillingSubscription,
				resetBillingCycle,
				discounts,
				noBillingChanges,
				carryOverBalances,
				carryOverBalanceFeatureIds,
				carryOverUsages,
				carryOverUsageFeatureIds,
				customLineItems,
				isFreeToPaidTransition,
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
			startDate,
			prorationBehavior,
			redirectMode,
			newBillingSubscription,
			resetBillingCycle,
			discounts,
			noBillingChanges,
			carryOverBalances,
			carryOverBalanceFeatureIds,
			carryOverUsages,
			carryOverUsageFeatureIds,
			customLineItems,
			isFreeToPaidTransition,
		],
	);

	const buildRequestBody = useMemo(
		() =>
			({
				useInvoice,
				enableProductImmediately,
				finalizeInvoice,
			}: {
				useInvoice?: boolean;
				enableProductImmediately?: boolean;
				finalizeInvoice?: boolean;
			} = {}): AttachParamsV0 | null => {
				if (!requestBody) return null;

				const body = { ...requestBody };

				if (useInvoice) {
					body.invoice = true;
					body.enable_product_immediately = enableProductImmediately;
					body.finalize_invoice = finalizeInvoice ?? false;
				}

				return body;
			},
		[requestBody],
	);

	return { requestBody, buildRequestBody };
}
