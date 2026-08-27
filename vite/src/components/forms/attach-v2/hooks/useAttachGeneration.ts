import { useCallback } from "react";
import type { BillingGenerationState } from "@/components/forms/shared/generation/BillingPromptBar";
import { useBillingGeneration } from "@/components/forms/shared/generation/useBillingGeneration";
import type { AttachForm } from "../attachFormSchema";
import { attachFormOverridesFromRequestBody } from "../utils/attachFormOverridesFromRequestBody";
import type { UseAttachForm } from "./useAttachForm";

const generatedEntityScope = (
	request: Record<string, unknown>,
): string | null | undefined => {
	const primaryPlan = Array.isArray(request.plans)
		? (request.plans[0] as Record<string, unknown> | undefined)
		: undefined;
	const scope = primaryPlan ? primaryPlan.entity_id : request.entity_id;
	return scope === null || typeof scope === "string" ? scope : undefined;
};

export function useAttachGeneration({
	form,
	customerId,
	currentRequest,
	markProgrammaticProductChange,
	onScopeChange,
}: {
	form: UseAttachForm;
	customerId: string | undefined;
	currentRequest: Record<string, unknown> | null;
	markProgrammaticProductChange: (nextProductId: string | undefined) => void;
	onScopeChange?: (entityId: string | undefined) => void;
}): BillingGenerationState {
	const onGenerated = useCallback(
		(request: Record<string, unknown>) => {
			const overrides = attachFormOverridesFromRequestBody(request);
			markProgrammaticProductChange(overrides.productId);
			for (const [key, value] of Object.entries(overrides)) {
				form.setFieldValue(key as keyof AttachForm, value as never);
			}
			const entityScope = generatedEntityScope(request);
			if (entityScope !== undefined) {
				onScopeChange?.(entityScope ?? undefined);
			}
		},
		[form, markProgrammaticProductChange, onScopeChange],
	);

	return useBillingGeneration({
		currentRequest,
		customerId,
		onGenerated,
		tool: "attach",
	});
}
