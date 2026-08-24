import { useCallback } from "react";
import { toast } from "sonner";
import type { BillingGenerationState } from "@/components/forms/shared/generation/BillingPromptBar";
import { useBillingGeneration } from "@/components/forms/shared/generation/useBillingGeneration";
import type { CreateScheduleForm } from "../createScheduleFormSchema";
import { scheduleFormFromRequestBody } from "../utils/scheduleFormFromRequestBody";
import type { UseCreateScheduleForm } from "./useCreateScheduleForm";

export function useCreateScheduleGeneration({
	form,
	customerId,
	currentRequest,
}: {
	form: UseCreateScheduleForm;
	customerId: string | undefined;
	currentRequest: Record<string, unknown> | null;
}): BillingGenerationState {
	const onGenerated = useCallback(
		(request: Record<string, unknown>) => {
			const next = scheduleFormFromRequestBody(request);
			if (!next) {
				toast.error("Couldn't build a schedule from that prompt");
				return;
			}
			// enablePlanImmediately is owned by the checkout stage — the provider
			// resets it outside checkout, so applying it would only fight that.
			const { enablePlanImmediately: _ignored, ...applicable } = next;
			for (const [key, value] of Object.entries(applicable)) {
				form.setFieldValue(key as keyof CreateScheduleForm, value as never);
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
