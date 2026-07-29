import {
	type CreateFeature,
	FeatureType,
	FeatureUsageType,
	isAiCreditSystem,
	isAnyCreditSystem,
} from "@autumn/shared";
import { AreaRadioGroupItem, RadioGroup } from "@autumn/ui";
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
			const isAi = isAiCreditSystem(values.type);

			setFeature({
				...feature,
				type: values.type,
				config: isAi
					? {
							...values.config,
							default_markup: values.defaultMarkup,
							provider_markups: values.provider_markups,
						}
					: values.config,
				model_markups: values.model_markups,
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
	if (isAnyCreditSystem(feature.type)) {
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
