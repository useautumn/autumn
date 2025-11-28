import { useAppForm } from "@/hooks/form/form";
import {
	type AttachProductForm,
	AttachProductFormSchema,
} from "./attach-product-form-schema";

export function useAttachProductForm({
	initialProductId,
	initialPrepaidOptions,
}: {
	initialProductId?: string;
	initialPrepaidOptions?: Record<string, number>;
} = {}) {
	return useAppForm({
		defaultValues: {
			productId: initialProductId || "",
			prepaidOptions: {} as Record<string, number>,
			initialPrepaidOptions: initialPrepaidOptions ?? undefined,
		} as AttachProductForm,
		validators: {
			onChange: AttachProductFormSchema.passthrough(),
			onSubmit: AttachProductFormSchema.passthrough(),
		},
	});
}

export type UseAttachProductForm = ReturnType<typeof useAttachProductForm>;
