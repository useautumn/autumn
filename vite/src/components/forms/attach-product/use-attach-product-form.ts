import { useAppForm } from "@/hooks/form/form";
import {
	type AttachProductForm,
	AttachProductFormSchema,
	type ProductFormItem,
} from "./attach-product-form-schema";

export function useAttachProductForm() {
	return useAppForm({
		defaultValues: {
			products: [] as ProductFormItem[],
			prepaidQuantities: {} as Record<string, number>,
		} satisfies AttachProductForm,
		validators: {
			onChange: AttachProductFormSchema,
			onSubmit: AttachProductFormSchema,
		},
	});
}

export type UseAttachProductForm = ReturnType<typeof useAttachProductForm>;
