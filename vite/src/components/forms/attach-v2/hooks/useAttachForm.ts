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
		} as AttachForm,
		validators: {
			onChange: AttachFormSchema,
			onSubmit: AttachFormSchema,
		},
	});
}

export type UseAttachForm = ReturnType<typeof useAttachForm>;
