import { useEffect, useRef } from "react";
import { useAppForm } from "@/hooks/form/form";
import {
	type AttachProductForm,
	AttachProductFormSchema,
} from "../attach-product/attach-product-form-schema";

export function useUpdateSubscriptionForm({
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
		} as AttachProductForm,
		validators: {
			onChange: AttachProductFormSchema,
			onSubmit: AttachProductFormSchema,
		},
	});
}

// Subscribe to form changes and clear prepaid options when productId changes
// Prevents stale prepaid options from causing "no prepaid price found" in the `checkout` call
function useResetPrepaidOnProductChange({
	form,
}: {
	form: UseUpdateSubscriptionForm;
}) {
	const previousProductIdRef = useRef<string | undefined>();

	useEffect(() => {
		const subscription = form.store.subscribe(() => {
			const currentProductId = form.store.state.values.productId;

			if (
				previousProductIdRef.current !== undefined &&
				previousProductIdRef.current !== currentProductId
			) {
				form.setFieldValue("prepaidOptions", {});
			}
			previousProductIdRef.current = currentProductId;
		});

		return () => subscription();
	}, [form.store, form.setFieldValue]);
}

export type UseUpdateSubscriptionForm = ReturnType<
	typeof useUpdateSubscriptionForm
>;
