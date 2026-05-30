import {
	type CreateFeature,
	FeatureType,
	FeatureUsageType,
} from "@autumn/shared";
import { AreaRadioGroupItem } from "@/components/v2/radio-groups/AreaRadioGroupItem";
import { RadioGroup } from "@/components/v2/radio-groups/RadioGroup";
import { SheetSection } from "@/components/v2/sheets/InlineSheet";
import { CreditSystemSchema } from "@/views/products/features/credit-systems/components/CreditSystemSchema";
import { useCreditSystemForm } from "@/views/products/features/credit-systems/hooks/useCreditSystemForm";

function NewFeatureCreditSchema({
	feature,
	setFeature,
}: {
	feature: CreateFeature;
	setFeature: (feature: CreateFeature) => void;
}) {
	const form = useCreditSystemForm({
		feature: {
			internal_id: "",
			org_id: "",
			created_at: 0,
			env: "sandbox" as any,
			id: feature.id ?? "",
			name: feature.name ?? "",
			type: feature.type,
			config: feature.config ?? {},
			archived: false,
			event_names: feature.event_names ?? [],
			model_markups: feature.model_markups ?? null,
		},
		onChange: (values) => {
			const isAi = values.type === FeatureType.AiCreditSystem;
			const materializedMarkups = isAi
				? Object.fromEntries(
						Object.entries(values.model_markups ?? {}).map(([key, entry]) => [
							key,
							entry?.markup == null
								? { ...entry, markup: values.defaultMarkup }
								: entry,
						]),
					)
				: values.model_markups;

			setFeature({
				...feature,
				type: values.type,
				config: values.config,
				model_markups: materializedMarkups,
			});
		},
	});

	return <CreditSystemSchema form={form} />;
}

export function NewFeatureBehaviour({
	feature,
	setFeature,
}: {
	feature: CreateFeature;
	setFeature: (feature: CreateFeature) => void;
}) {
	if (
		feature.type === FeatureType.CreditSystem ||
		feature.type === FeatureType.AiCreditSystem
	) {
		return <NewFeatureCreditSchema feature={feature} setFeature={setFeature} />;
	}

	if (feature.type === FeatureType.Metered) {
		return (
			<SheetSection>
				<RadioGroup
					value={feature.config?.usage_type || FeatureUsageType.Single}
					onValueChange={(value) => {
						setFeature({
							...feature,
							config: {
								...feature.config,
								usage_type: value as FeatureUsageType,
							},
						});
					}}
					className="space-y-0"
				>
					<AreaRadioGroupItem
						value={FeatureUsageType.Single}
						label="Consumable"
						description="Usage can reset periodically (eg messages, video minutes)"
					/>
					<AreaRadioGroupItem
						value={FeatureUsageType.Continuous}
						label="Non-consumable"
						description="Usage is persistent and never resets (eg seats, storage)"
					/>
				</RadioGroup>
			</SheetSection>
		);
	}
}
