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

	return (
		<SheetSection>
			<div className="space-y-4">
				<div className="grid grid-cols-2 gap-2">
					<div>
						<FormLabel>Name</FormLabel>
						<Input
							placeholder="eg, Chat Messages"
							value={feature.name}
							onChange={(e) => setSource(e.target.value)}
						/>
					</div>

					<div>
						<FormLabel>ID</FormLabel>
						<Input
							placeholder="chat_messages"
							value={feature.id}
							onChange={(e) => setTarget(e.target.value)}
						/>
					</div>
				</div>
			</div>
		</SheetSection>
	);
}
