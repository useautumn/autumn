import { AiCreditSchema } from "@/views/products/features/credit-systems/components/AiCreditSchema";
import { useFeatureOverride } from "@/views/products/features/credit-systems/hooks/useFeatureOverride";
import { useMarkupsOverrideForm } from "@/views/products/features/credit-systems/hooks/useMarkupsOverrideForm";
import { FeatureOverrideArea } from "./FeatureOverrideArea";

export function AiMarkupsOverride() {
	const { creditSystem, markups, hasOverride, setMarkups, seedMarkups, clear } =
		useFeatureOverride();

	const form = useMarkupsOverrideForm({
		creditSystem,
		markups,
		// Seeding must not itself write an override the user never enabled.
		onChange: (next) => hasOverride && setMarkups(next),
	});

	return (
		<FeatureOverrideArea
			title="Custom markup"
			description="Override this credit system's markup for customers on this plan. Replaces the feature's markup chain entirely, so a level left blank means no markup rather than the feature's."
			enabled={hasOverride}
			onSeed={seedMarkups}
			onClear={clear}
		>
			<AiCreditSchema form={form} />
		</FeatureOverrideArea>
	);
}
