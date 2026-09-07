import type { Feature, ModelMarkups } from "@autumn/shared";
import { FeatureType } from "@autumn/shared";
import { useAppForm } from "@/hooks/form/form";
import { useFormValuesListener } from "@/hooks/form/useFormValuesListener";
import { createSchemaItem } from "../utils/creditSchemaUtils";

export interface CreditSystemFormValues {
	name: string;
	id: string;
	type: FeatureType;
	config: Record<string, unknown>;
	event_names: string[];
	model_markups: NonNullable<ModelMarkups>;
	/** Global default markup for the AI credit system (persisted to config.default_markup). */
	defaultMarkup: number;
	/** Per-provider default markups (persisted to config.provider_markups). */
	provider_markups: Record<string, { markup: number }>;
	stripe_product_id: string | null;
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
			config: feature?.config ?? { schema: [createSchemaItem()] },
			event_names: feature?.event_names ?? [],
			model_markups:
				(feature?.model_markups as CreditSystemFormValues["model_markups"]) ??
				{},
			defaultMarkup:
				(feature?.config?.default_markup as number | undefined) ?? 0,
			provider_markups:
				(feature?.config
					?.provider_markups as CreditSystemFormValues["provider_markups"]) ??
				{},
			stripe_product_id: feature?.stripe_product_id ?? null,
		} satisfies CreditSystemFormValues,
		onSubmit: onSubmit ? ({ value }) => onSubmit(value) : undefined,
	});

	useFormValuesListener({ store: form.store, onChange });

	return form;
}

export type CreditSystemFormInstance = ReturnType<typeof useCreditSystemForm>;
