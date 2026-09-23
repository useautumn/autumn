import { useCallback } from "react";
import { toast } from "sonner";
import type { CustomerStateForm } from "@/components/forms/customer-state/customerStateSchema";
import type { UseCustomerStateForm } from "@/components/forms/customer-state/useCustomerStateForm";
import type { BillingGenerationState } from "@/components/forms/shared/generation/BillingPromptBar";
import { useBillingGeneration } from "@/components/forms/shared/generation/useBillingGeneration";
import { scheduleFormFromRequestBody } from "../utils/scheduleFormFromRequestBody";

export function useCreateScheduleGeneration({
	form,
	customerId,
	currentRequest,
}: {
	form: UseCustomerStateForm;
	customerId: string | undefined;
	currentRequest: Record<string, unknown> | null;
}): BillingGenerationState {
	const onGenerated = useCallback(
		(request: Record<string, unknown>) => {
			const next = scheduleFormFromRequestBody(
				request,
				form.store.state.values.phases,
			);
			if (!next) {
				toast.error("Couldn't build a schedule from that prompt");
				return;
			}
			// enablePlanImmediately is owned by the checkout stage — the provider
			// resets it outside checkout, so applying it would only fight that.
			const { enablePlanImmediately: _ignored, ...applicable } = next;
			for (const [key, value] of Object.entries(applicable)) {
				form.setFieldValue(key as keyof CustomerStateForm, value as never);
			}
		},
		[form],
	);

	return useBillingGeneration({
		currentRequest,
		customerId,
		onGenerated,
		tool: "create_schedule",
	});
}
