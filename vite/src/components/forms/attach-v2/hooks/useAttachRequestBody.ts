import type {
	AttachParamsV0,
	BillingBehavior,
	CustomizePlanLicense,
	FreeTrialDuration,
	PlanTiming,
	ProductItem,
	ProductItemInterval,
	ProductV2,
	RedirectMode,
	TrialOnEnd,
} from "@autumn/shared";
import { useMemo } from "react";
import { normalizeBillingRequestItems } from "@/components/forms/shared/utils/normalizeBillingRequestItems";
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
	addLicenses: CustomizePlanLicense[] | null;
	grantFree: boolean;
	version: number | undefined;
	trialLength: number | null;
	trialDuration: FreeTrialDuration;
	trialEnabled: boolean;
	trialCardRequired: boolean;
	trialOnEnd: TrialOnEnd;
	planSchedule: PlanTiming | null;
	startDate: number | null;
	endDate: number | null;
	prorationBehavior: BillingBehavior | null;
	redirectMode: RedirectMode;
	newBillingSubscription: boolean;
	resetBillingCycle: boolean;
	discounts: FormDiscount[];
	noBillingChanges: boolean;
	enablePlanImmediately: boolean;
	carryOverBalances: boolean;
	carryOverBalanceFeatureIds: string[];
	carryOverUsages: boolean;
	carryOverUsageFeatureIds: string[];
	customLineItems: FormCustomLineItem[];
	disableProration: boolean;
}

/** Pure function to build the attach request body. Extracted for testability. */
export function buildAttachRequestBody({
	customerId,
	entityId,
	product,
	prepaidOptions,
	items,
	addLicenses,
	grantFree,
	version,
	trialLength,
	trialDuration,
	trialEnabled,
	trialCardRequired,
	trialOnEnd,
	planSchedule,
	startDate,
	endDate,
	prorationBehavior,
	redirectMode,
	newBillingSubscription,
	resetBillingCycle,
	discounts,
	noBillingChanges,
	enablePlanImmediately,
	carryOverBalances,
	carryOverBalanceFeatureIds = [],
	carryOverUsages,
	carryOverUsageFeatureIds = [],
	customLineItems,
	disableProration,
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
		const normalizedItems = normalizeBillingRequestItems({ items });
		if (normalizedItems) {
			body.items = normalizedItems.map((item) => ({
				...item,
				interval: (item.interval ?? null) as ProductItemInterval | null,
			}));
		} else if (grantFree) {
			// Send explicit `[]` so the backend overrides the product's default
			// (paid) items; omitting `items` falls back to them. See useGrantFree.
			body.items = [];
		}
	}

	if (addLicenses !== null) {
		body.upsert_licenses = addLicenses;
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
		trialOnEnd,
	});
	if (freeTrial !== undefined) {
		body.free_trial = freeTrial;
	} else if (!trialEnabled) {
		body.free_trial = null;
	}

	if (startDate && !trialEnabled) {
		body.starts_at = startDate;
	} else if (planSchedule) {
		body.plan_schedule = planSchedule;
	}

	if (endDate) {
		body.ends_at = endDate;
	}

	const normalizedProrationBehavior = normalizeAttachProrationBehavior({
		prorationBehavior,
		newBillingSubscription,
		disableProration,
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

	if (enablePlanImmediately) {
		body.enable_product_immediately = true;
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
		addLicenses,
		grantFree,
		version,
		trialLength,
		trialDuration,
		trialEnabled,
		trialCardRequired,
		trialOnEnd,
		planSchedule,
		startDate,
		endDate,
		prorationBehavior,
		redirectMode,
		newBillingSubscription,
		resetBillingCycle,
		discounts,
		noBillingChanges,
		enablePlanImmediately,
		carryOverBalances,
		carryOverBalanceFeatureIds,
		carryOverUsages,
		carryOverUsageFeatureIds,
		customLineItems,
		disableProration,
	} = params;

	const requestBody = useMemo(
		() =>
			buildAttachRequestBody({
				customerId,
				entityId,
				product,
				prepaidOptions,
				items,
				addLicenses,
				grantFree,
				version,
				trialLength,
				trialDuration,
				trialEnabled,
				trialCardRequired,
				trialOnEnd,
				planSchedule,
				startDate,
				endDate,
				prorationBehavior,
				redirectMode,
				newBillingSubscription,
				resetBillingCycle,
				discounts,
				noBillingChanges,
				enablePlanImmediately,
				carryOverBalances,
				carryOverBalanceFeatureIds,
				carryOverUsages,
				carryOverUsageFeatureIds,
				customLineItems,
				disableProration,
			}),
		[
			customerId,
			entityId,
			product,
			prepaidOptions,
			items,
			addLicenses,
			grantFree,
			version,
			trialLength,
			trialDuration,
			trialEnabled,
			trialCardRequired,
			trialOnEnd,
			planSchedule,
			startDate,
			endDate,
			prorationBehavior,
			redirectMode,
			newBillingSubscription,
			resetBillingCycle,
			discounts,
			noBillingChanges,
			enablePlanImmediately,
			carryOverBalances,
			carryOverBalanceFeatureIds,
			carryOverUsages,
			carryOverUsageFeatureIds,
			customLineItems,
			disableProration,
		],
	);

	const buildRequestBody = useMemo(
		() =>
			({
				useInvoice,
				enableProductImmediately,
				finalizeInvoice,
				invoiceTemplateId,
				netTermsDays,
				longLivedCheckout,
			}: {
				useInvoice?: boolean;
				enableProductImmediately?: boolean;
				finalizeInvoice?: boolean;
				invoiceTemplateId?: string;
				netTermsDays?: number;
				longLivedCheckout?: boolean;
			} = {}): AttachParamsV0 | null => {
				if (!requestBody) return null;

				const body = { ...requestBody };

				if (useInvoice) {
					body.invoice = true;
					body.finalize_invoice = finalizeInvoice ?? false;
					body.invoice_template_id = invoiceTemplateId;
					body.net_terms_days = netTermsDays;
				}

				// `enable_product_immediately` applies to both invoice mode and the
				// stripe_checkout "enable plan immediately" flow. Keep it independent
				// of `useInvoice` so the dashboard can attach the cusProduct when
				// copying a checkout URL too.
				if (enableProductImmediately !== undefined) {
					body.enable_product_immediately = enableProductImmediately;
				}

				if (longLivedCheckout) {
					body.long_lived_checkout = true;
				}

				return body;
			},
		[requestBody],
	);

	return { requestBody, buildRequestBody };
}
