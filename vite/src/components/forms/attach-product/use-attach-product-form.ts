import { useAppForm } from "@/hooks/form/form";
import {
	type AttachProductForm,
	AttachProductFormSchema,
} from "./attach-product-form-schema";

export function useAttachProductForm({
	initialCustomerId,
	initialProductId,
}: {
	initialCustomerId?: string;
	initialProductId?: string;
} = {}) {
	return useAppForm({
		defaultValues: {
			customerId: initialCustomerId || "",
			productId: initialProductId || "",
			prepaidOptions: {},
		} satisfies AttachProductForm,
		validators: {
			onChange: AttachProductFormSchema,
			onSubmit: AttachProductFormSchema,
		},
	});
}

export type UseAttachProductForm = ReturnType<typeof useAttachProductForm>;
