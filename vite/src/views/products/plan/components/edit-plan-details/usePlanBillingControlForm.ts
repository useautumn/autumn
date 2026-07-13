import {
	type AutoTopup,
	type BillingControlKey,
	type DbOverageAllowed,
	type DbSpendLimit,
	type DbUsageAlert,
	type DbUsageLimit,
	PurchaseLimitInterval,
	ResetInterval,
	type SpendLimitType,
} from "@autumn/shared";
import { useRef } from "react";
import { z } from "zod/v4";
import {
	type OverageBillingOption,
	optionToSkipOverageBilling,
	skipOverageBillingToOption,
} from "@/components/billing-controls/overageBillingOptions";
import { useAppForm } from "@/hooks/form/form";

export type ControlItem =
	| AutoTopup
	| DbSpendLimit
	| DbUsageLimit
	| DbUsageAlert
	| DbOverageAllowed;

export type PlanBillingControlFormValues = {
	feature_id: string;
	enabled: boolean;
	threshold: number | null;
	quantity: number | null;
	has_purchase_limit: boolean;
	purchase_limit_interval: PurchaseLimitInterval;
	purchase_limit_interval_count: number | null;
	purchase_limit_limit: number | null;
	invoice_mode: boolean;
	limit_type: SpendLimitType;
	overage_limit: number | null;
	overage_billing: OverageBillingOption;
	usage_limit: number | null;
	usage_interval: ResetInterval;
	alert_name: string;
	alert_threshold: number | null;
	threshold_type: DbUsageAlert["threshold_type"];
};

const requireNumber = (min: number, message: string) =>
	z.number({ message }).refine((value) => value >= min, { message });

const AutoTopupFormSchema = z
	.object({
		feature_id: z.string().min(1, "Please select a feature"),
		threshold: requireNumber(0, "Please enter a valid threshold"),
		quantity: requireNumber(1, "Please enter a valid quantity"),
		has_purchase_limit: z.boolean(),
		purchase_limit_limit: z.number().nullable(),
	})
	.check((ctx) => {
		const { has_purchase_limit, purchase_limit_limit } = ctx.value;
		if (!has_purchase_limit) return;
		if (purchase_limit_limit == null || purchase_limit_limit < 1) {
			ctx.issues.push({
				code: "custom",
				input: purchase_limit_limit,
				path: ["purchase_limit_limit"],
				message: "Please enter a valid purchase limit",
			});
		}
	});

const SpendLimitFormSchema = z
	.object({
		feature_id: z.string(),
		limit_type: z.enum(["absolute", "usage_percentage"]),
		overage_limit: z.number().nullable(),
	})
	.check((ctx) => {
		const { overage_limit, feature_id } = ctx.value;
		if (overage_limit == null) return;
		if (overage_limit < 0) {
			ctx.issues.push({
				code: "custom",
				input: overage_limit,
				path: ["overage_limit"],
				message: "Please enter a valid overage limit",
			});
			return;
		}
		if (!feature_id) {
			ctx.issues.push({
				code: "custom",
				input: feature_id,
				path: ["feature_id"],
				message: "Feature is required when overage limit is set",
			});
		}
	});

const UsageLimitFormSchema = z.object({
	feature_id: z.string().min(1, "Please select a feature"),
	usage_limit: requireNumber(0, "Please enter a valid usage limit"),
});

const UsageAlertFormSchema = z
	.object({
		alert_threshold: requireNumber(0, "Please enter a valid threshold"),
		threshold_type: z.string(),
	})
	.check((ctx) => {
		const { alert_threshold, threshold_type } = ctx.value;
		if (threshold_type === "remaining_percentage" && alert_threshold > 100) {
			ctx.issues.push({
				code: "custom",
				input: alert_threshold,
				path: ["alert_threshold"],
				message: "Remaining percentage must be between 0 and 100",
			});
		}
	});

const OverageAllowedFormSchema = z.object({
	feature_id: z.string().min(1, "Please select a feature"),
});

const SCHEMA_BY_CONTROL_KEY: Record<BillingControlKey, z.ZodTypeAny> = {
	auto_topups: AutoTopupFormSchema,
	spend_limits: SpendLimitFormSchema,
	usage_limits: UsageLimitFormSchema,
	usage_alerts: UsageAlertFormSchema,
	overage_allowed: OverageAllowedFormSchema,
};

const emptyToUndefined = (value: string) => {
	const trimmed = value.trim();
	return trimmed === "" ? undefined : trimmed;
};

export function buildControlItem(
	controlKey: BillingControlKey,
	values: PlanBillingControlFormValues,
): ControlItem {
	if (controlKey === "auto_topups") {
		const autoTopup: AutoTopup = {
			feature_id: values.feature_id,
			enabled: values.enabled,
			threshold: values.threshold ?? 0,
			quantity: values.quantity ?? 0,
		};
		if (values.has_purchase_limit) {
			const intervalCount = values.purchase_limit_interval_count;
			autoTopup.purchase_limit = {
				interval: values.purchase_limit_interval,
				interval_count:
					intervalCount == null || intervalCount < 1 ? 1 : intervalCount,
				limit: values.purchase_limit_limit ?? 0,
			};
		}
		if (values.invoice_mode) autoTopup.invoice_mode = true;
		return autoTopup;
	}

	if (controlKey === "spend_limits") {
		return {
			feature_id: emptyToUndefined(values.feature_id),
			enabled: values.enabled,
			limit_type: values.limit_type,
			overage_limit: values.overage_limit ?? undefined,
			skip_overage_billing: optionToSkipOverageBilling(values.overage_billing),
		} satisfies DbSpendLimit;
	}

	if (controlKey === "usage_limits") {
		return {
			feature_id: values.feature_id,
			enabled: values.enabled,
			limit: values.usage_limit ?? 0,
			interval: values.usage_interval,
		} satisfies DbUsageLimit;
	}

	if (controlKey === "usage_alerts") {
		return {
			feature_id: emptyToUndefined(values.feature_id),
			enabled: values.enabled,
			threshold: values.alert_threshold ?? 0,
			threshold_type: values.threshold_type,
			name: emptyToUndefined(values.alert_name),
		} satisfies DbUsageAlert;
	}

	return {
		feature_id: values.feature_id,
		enabled: values.enabled,
	} satisfies DbOverageAllowed;
}

function toDefaultValues(
	controlKey: BillingControlKey,
	item?: ControlItem,
): PlanBillingControlFormValues {
	const autoTopup = controlKey === "auto_topups" ? (item as AutoTopup) : null;
	const spendLimit =
		controlKey === "spend_limits" ? (item as DbSpendLimit) : null;
	const usageLimit =
		controlKey === "usage_limits" ? (item as DbUsageLimit) : null;
	const usageAlert =
		controlKey === "usage_alerts" ? (item as DbUsageAlert) : null;
	const overageAllowed =
		controlKey === "overage_allowed" ? (item as DbOverageAllowed) : null;

	return {
		feature_id:
			autoTopup?.feature_id ??
			spendLimit?.feature_id ??
			usageLimit?.feature_id ??
			usageAlert?.feature_id ??
			overageAllowed?.feature_id ??
			"",
		enabled:
			autoTopup?.enabled ??
			spendLimit?.enabled ??
			usageLimit?.enabled ??
			usageAlert?.enabled ??
			overageAllowed?.enabled ??
			true,
		threshold: autoTopup?.threshold ?? null,
		quantity: autoTopup?.quantity ?? null,
		has_purchase_limit: !!autoTopup?.purchase_limit,
		purchase_limit_interval:
			autoTopup?.purchase_limit?.interval ?? PurchaseLimitInterval.Month,
		purchase_limit_interval_count:
			autoTopup?.purchase_limit?.interval_count ?? 1,
		purchase_limit_limit: autoTopup?.purchase_limit?.limit ?? null,
		invoice_mode: autoTopup?.invoice_mode ?? false,
		limit_type: spendLimit?.limit_type ?? "absolute",
		overage_limit: spendLimit?.overage_limit ?? null,
		overage_billing: skipOverageBillingToOption(
			spendLimit?.skip_overage_billing,
		),
		usage_limit: usageLimit?.limit ?? null,
		usage_interval: usageLimit?.interval ?? ResetInterval.Month,
		alert_name: usageAlert?.name ?? "",
		alert_threshold: usageAlert?.threshold ?? null,
		threshold_type: usageAlert?.threshold_type ?? "usage",
	};
}

export function usePlanBillingControlForm({
	controlKey,
	item,
	onValidSubmit,
}: {
	controlKey: BillingControlKey;
	item?: ControlItem;
	onValidSubmit: (values: PlanBillingControlFormValues) => void;
}) {
	const defaultValuesRef = useRef<PlanBillingControlFormValues>(
		toDefaultValues(controlKey, item),
	);

	return useAppForm({
		defaultValues: defaultValuesRef.current,
		validators: { onSubmit: SCHEMA_BY_CONTROL_KEY[controlKey] },
		onSubmit: ({ value }) => onValidSubmit(value),
	});
}

export type UsePlanBillingControlForm = ReturnType<
	typeof usePlanBillingControlForm
>;
