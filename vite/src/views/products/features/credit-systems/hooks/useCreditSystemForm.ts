import type { Feature, ModelMarkups } from "@autumn/shared";
import { FeatureType } from "@autumn/shared";
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
			config: feature?.config ?? {
				schema: [
					{ metered_feature_id: "", feature_amount: 1, credit_amount: 0 },
				],
			},
			event_names: feature?.event_names ?? [],
			model_markups:
				(feature?.model_markups as CreditSystemFormValues["model_markups"]) ??
				{},
			defaultMarkup: 0,
		} satisfies CreditSystemFormValues,
		onSubmit: onSubmit ? ({ value }) => onSubmit(value) : undefined,
	});

	return form;
}

export type CreditSystemFormInstance = ReturnType<typeof useCreditSystemForm>;
