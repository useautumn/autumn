import type { Feature, ModelMarkups } from "@autumn/shared";
import { FeatureType } from "@autumn/shared";
import { useStore } from "@tanstack/react-form";
import { useEffect, useRef } from "react";
import { useAppForm } from "@/hooks/form/form";

export interface CreditSystemFormValues {
	name: string;
	id: string;
	type: FeatureType;
	config: Record<string, unknown>;
	event_names: string[];
	model_markups: NonNullable<ModelMarkups>;
	defaultMarkup: number;
}

export function useCreditSystemForm({
	feature,
	onSubmit,
	onChange,
}: {
	feature: Feature | null;
	onSubmit?: (values: CreditSystemFormValues) => Promise<void>;
	onChange?: (values: CreditSystemFormValues) => void;
}) {
	const form = useAppForm({
		defaultValues: {
			name: feature?.name ?? "",
			id: feature?.id ?? "",
			type: feature?.type ?? FeatureType.CreditSystem,
			config: feature?.config ?? { schema: [{ metered_feature_id: "", feature_amount: 1, credit_amount: 0 }] },
			event_names: feature?.event_names ?? [],
			model_markups: (feature?.model_markups as CreditSystemFormValues["model_markups"]) ?? {},
			defaultMarkup: 0,
		} satisfies CreditSystemFormValues,
		onSubmit: onSubmit ? ({ value }) => onSubmit(value) : undefined,
	});

	// Form-level `listeners.onChange` only fires when a FieldApi instance is
	// registered for the changed field (see form-core FormApi.setFieldValue).
	// None of these fields are mounted via <form.Field>, so we subscribe to the
	// store directly and push value changes out to the caller.
	const values = useStore(form.store, (s) => s.values);
	const onChangeRef = useRef(onChange);
	onChangeRef.current = onChange;
	useEffect(() => {
		onChangeRef.current?.(values);
	}, [values]);

	return form;
}

export type CreditSystemFormInstance = ReturnType<typeof useCreditSystemForm>;
