import { CreditOverrideRateCard } from "@/views/products/features/credit-systems/components/CreditOverrideRateCard";
import { useFeatureOverride } from "@/views/products/features/credit-systems/hooks/useFeatureOverride";
import { AiMarkupsOverride } from "./AiMarkupsOverride";

export function FeatureOverrideConfig() {
	const { item, creditSystem, isAi } = useFeatureOverride();

	if (!item) return null;
	// The markup form seeds once, so a different credit system needs a new one.
	if (isAi) return <AiMarkupsOverride key={creditSystem?.internal_id} />;

	return <CreditOverrideRateCard />;
}
