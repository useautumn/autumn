import { useCallback } from "react";
import type { BillingGenerationState } from "@/components/forms/shared/generation/BillingPromptBar";
import { useBillingGeneration } from "@/components/forms/shared/generation/useBillingGeneration";
import type { UpdateSubscriptionForm } from "../updateSubscriptionFormSchema";
import { updateSubscriptionFormOverridesFromRequestBody } from "../utils/updateSubscriptionFormOverridesFromRequestBody";
import type { UseUpdateSubscriptionForm } from "./useUpdateSubscriptionForm";

export function useUpdateSubscriptionGeneration({
	form,
	customerId,
	customerProductId,
	currentRequest,
}: {
	form: UseUpdateSubscriptionForm;
	customerId: string | undefined;
	customerProductId: string | undefined;
	currentRequest: Record<string, unknown> | null;
}): BillingGenerationState {
	const onGenerated = useCallback(
		(request: Record<string, unknown>) => {
			const overrides = updateSubscriptionFormOverridesFromRequestBody(request);
			for (const [key, value] of Object.entries(overrides)) {
				form.setFieldValue(key as keyof UpdateSubscriptionForm, value as never);
			}
		},
		[form],
	);

	return useBillingGeneration({
		currentRequest,
		customerId,
		customerProductId,
		onGenerated,
		tool: "update_subscription",
	});
}
