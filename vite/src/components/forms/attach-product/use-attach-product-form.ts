import { useAppForm } from "@/hooks/form/form";
import {
	type AttachProductForm,
	AttachProductFormSchema,
	type PrepaidOption,
	type ProductFormItem,
} from "./attach-product-form-schema";

export function useAttachProductForm() {
	return useAppForm({
		defaultValues: {
			products: [] as ProductFormItem[],
			prepaidOptions: [] as PrepaidOption[],
		} satisfies AttachProductForm,
		validators: {
			onChange: AttachProductFormSchema,
			onSubmit: AttachProductFormSchema,
		},
	});
}

export type UseAttachProductForm = ReturnType<typeof useAttachProductForm>;
