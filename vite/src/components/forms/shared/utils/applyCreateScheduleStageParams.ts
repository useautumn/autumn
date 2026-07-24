import type { CreateScheduleParamsV0 } from "@autumn/shared";
import type { BillingStageParams } from "./billingStageParams";

export function applyCreateScheduleStageParams({
	requestBody,
	useInvoice,
	enableProductImmediately,
	finalizeInvoice,
	invoiceTemplateId,
	netTermsDays,
	longLivedCheckout,
}: BillingStageParams & {
	requestBody: CreateScheduleParamsV0 | null;
}): CreateScheduleParamsV0 | null {
	if (!requestBody) return null;

	if (useInvoice) {
		return {
			...requestBody,
			invoice_mode: {
				enabled: true,
				enable_plan_immediately: enableProductImmediately ?? true,
				finalize: finalizeInvoice ?? true,
				...(invoiceTemplateId !== undefined
					? { invoice_template_id: invoiceTemplateId }
					: {}),
				...(netTermsDays !== undefined ? { net_terms_days: netTermsDays } : {}),
			},
		};
	}

	return {
		...requestBody,
		...(enableProductImmediately !== undefined
			? { enable_plan_immediately: enableProductImmediately }
			: {}),
		...(longLivedCheckout ? { long_lived_checkout: true } : {}),
	};
}
