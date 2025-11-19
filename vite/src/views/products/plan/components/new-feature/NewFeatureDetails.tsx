import type { CreateFeature } from "@autumn/shared";
import { FormLabel } from "@/components/v2/form/FormLabel";
import { Input } from "@/components/v2/inputs/Input";
import { SheetSection } from "@/components/v2/sheets/InlineSheet";
import { useAutoSlug } from "@/hooks/common/useAutoSlug";
import { useFeatureStore } from "@/hooks/stores/useFeatureStore";

export function NewFeatureDetails({
	feature,
	setFeature,
}: {
	feature: CreateFeature;
	setFeature: (feature: CreateFeature) => void;
}) {
	const baseFeature = useFeatureStore((s) => s.baseFeature);

	// Check if feature already exists on backend (has internal_id from database)
	const isExistingFeature = !!baseFeature?.internal_id;

	const { setSource, setTarget } = useAutoSlug({
		setState: setFeature,
		sourceKey: "name" as keyof CreateFeature,
		targetKey: "id" as keyof CreateFeature,
		disableAutoSlug: isExistingFeature,
	});

	if (!feature) return null;

	return (
		<SheetSection title="Feature Details">
			<div className="space-y-4">
				<div className="grid grid-cols-2 gap-2">
					<div>
						<FormLabel>Name</FormLabel>
						<Input
							placeholder="Chatbot Credits"
							value={feature.name}
							onChange={(e) => setSource(e.target.value)}
						/>
					</div>

					<div>
						<FormLabel>ID</FormLabel>
						<Input
							placeholder="chatbot_credits"
							value={feature.id}
							onChange={(e) => setTarget(e.target.value)}
						/>
					</div>
				</div>
			</div>
		</SheetSection>
	);
}
