import { useState } from "react";
import { usePlanScopeField } from "@/components/forms/shared";

/** The scope a section's "Add plan" row adds its next plan under. */
export function useAddPlanScope({ disabled }: { disabled?: boolean } = {}) {
	const [entityId, setEntityId] = useState<string | null>(null);
	const { scope, hasEntities } = usePlanScopeField({
		planEntityId: entityId,
		disabled,
		onChange: (nextEntityId) => setEntityId(nextEntityId ?? null),
	});

	return { entityId, hasEntities, picker: scope?.picker };
}
