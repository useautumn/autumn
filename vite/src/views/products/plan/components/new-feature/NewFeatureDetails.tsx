import {
	type CreateFeature,
	FeatureType,
	FeatureUsageType,
} from "@autumn/shared";
import { FormLabel } from "@/components/v2/form/FormLabel";
import { Input } from "@/components/v2/inputs/Input";
import { SheetSection } from "@/components/v2/sheets/InlineSheet";
import { useAutoSlug } from "@/hooks/common/useAutoSlug";
import { useFeatureStore } from "@/hooks/stores/useFeatureStore";

const getPlaceholders = ({
	feature,
}: {
	feature: CreateFeature;
}): { name: string; id: string } => {
	const isBoolean = feature.type === FeatureType.Boolean;
	const isCreditSystem = feature.type === FeatureType.CreditSystem;
	const isNonConsumable =
		feature.type === FeatureType.Metered &&
		feature.config?.usage_type === FeatureUsageType.Continuous;

	if (isBoolean) {
		return { name: "eg, Premium Analytics", id: "premium_analytics" };
	}

	if (isCreditSystem) {
		return { name: "eg, AI Credits", id: "ai_credits" };
	}

	if (isNonConsumable) {
		return { name: "eg, Seats", id: "seats" };
	}

	// Default to consumable (metered single use)
	return { name: "eg, Chat Messages", id: "chat_messages" };
};

export function NewFeatureDetails({
	feature,
	setFeature,
}: {
	feature: CreateFeature;
	setFeature: (
		updater: CreateFeature | ((prev: CreateFeature) => CreateFeature),
	) => void;
}) {
	const baseFeature = useFeatureStore((s) => s.baseFeature);

	// Check if feature already exists on backend (has internal_id from database)
	const isExistingFeature = !!baseFeature?.internal_id;

	const { setSource, setTarget } = useAutoSlug({
		setState: setFeature,
		sourceKey: "name",
		targetKey: "id",
		disableAutoSlug: isExistingFeature,
	});

	if (!feature) return null;

	const placeholders = getPlaceholders({ feature });

	return (
		<SheetSection>
			<div className="space-y-4">
				<div className="grid grid-cols-2 gap-2">
					<div>
						<FormLabel>Name</FormLabel>
						<Input
							placeholder={placeholders.name}
							value={feature.name}
							onChange={(e) => setSource(e.target.value)}
						/>
					</div>

					<div>
						<FormLabel>ID</FormLabel>
						<Input
							placeholder={placeholders.id}
							value={feature.id}
							onChange={(e) => setTarget(e.target.value)}
						/>
					</div>
				</div>
			</div>
		</SheetSection>
	);
}
