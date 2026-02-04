import { FreeTrialDuration } from "@autumn/shared";
import { useAppForm } from "@/hooks/form/form";
import { type AttachForm, AttachFormSchema } from "../attachFormSchema";

export function useAttachForm({
	initialProductId,
	initialPrepaidOptions,
}: {
	initialProductId?: string;
	initialPrepaidOptions?: Record<string, number>;
} = {}) {
	return useAppForm({
		defaultValues: {
			productId: initialProductId || "",
			prepaidOptions: initialPrepaidOptions ?? {},
			items: null,
			version: undefined,
			trialLength: null,
			trialDuration: FreeTrialDuration.Day,
			trialEnabled: false,
			planSchedule: null,
		} as AttachForm,
		validators: {
			onChange: AttachFormSchema,
			onSubmit: AttachFormSchema,
		},
	});
}

export type UseAttachForm = ReturnType<typeof useAttachForm>;
