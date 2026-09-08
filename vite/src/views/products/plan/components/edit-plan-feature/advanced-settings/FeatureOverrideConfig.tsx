import { CreditOverrideRateCard } from "@/views/products/features/credit-systems/components/CreditOverrideRateCard";
import { useFeatureOverride } from "@/views/products/features/credit-systems/hooks/useFeatureOverride";
import { AiMarkupsOverride } from "./AiMarkupsOverride";
import { FeatureOverrideArea } from "./FeatureOverrideArea";

export function FeatureOverrideConfig() {
	const {
		item,
		creditSystem,
		isAi,
		hasOverride,
		schema,
		setSchema,
		seedSchema,
		clear,
	} = useFeatureOverride();

	if (!item) return null;
	// The markup form seeds once, so a different credit system needs a new one.
	if (isAi) return <AiMarkupsOverride key={creditSystem?.internal_id} />;

	return (
		<FeatureOverrideArea
			title="Custom rate card"
			description="Override this credit system's rate card for customers on this plan. Replaces the feature's rate card entirely."
			enabled={hasOverride}
			onSeed={seedSchema}
			onClear={clear}
		>
			<CreditOverrideRateCard
				schema={schema}
				creditSystem={creditSystem}
				onChange={setSchema}
				onRemoveLast={clear}
			/>
		</FeatureOverrideArea>
	);
}
