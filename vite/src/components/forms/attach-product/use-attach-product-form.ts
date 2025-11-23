import { useAppForm } from "@/hooks/form/form";
import {
	type AttachProductForm,
	AttachProductFormSchema,
} from "./attach-product-form-schema";

export function useAttachProductForm({
	initialProductId,
}: {
	initialProductId?: string;
} = {}) {
	return useAppForm({
		defaultValues: {
			productId: initialProductId || "",
			prepaidOptions: {} as Record<string, number>,
		} satisfies AttachProductForm,
		validators: {
			onChange: AttachProductFormSchema,
			onSubmit: AttachProductFormSchema,
		},
	});
}

export type UseAttachProductForm = ReturnType<typeof useAttachProductForm>;
