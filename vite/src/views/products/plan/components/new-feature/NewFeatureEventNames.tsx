import { type CreateFeature, FeatureType } from "@autumn/shared";
import { TagInput } from "@/components/v2/inputs/TagInput";
import { SheetSection } from "@/components/v2/sheets/InlineSheet";

export function NewFeatureEventNames({
	feature,
	setFeature,
}: {
	feature: CreateFeature;
	setFeature: (feature: CreateFeature) => void;
}) {
	if (
		feature.type &&
		feature.config?.usage_type &&
		feature.type !== FeatureType.Boolean
	)
		return (
			<SheetSection title="Event Names (optional)" withSeparator={false}>
				<div className="space-y-4">
					<div className="mt-3 space-y-4">
						<div className="flex w-full items-center gap-4">
							<TagInput
								placeholder="eg. chat-messages (press enter to add)"
								value={
									feature.config?.filters?.map(
										(filter: { value: string }) => filter.value,
									) || []
								}
								onChange={(tags) =>
									setFeature({
										...feature,
										config: {
											...feature.config,
											filters: tags.map((tag) => ({ value: tag })),
										},
									})
								}
							/>
						</div>
					</div>
				</div>
			</SheetSection>
		);
}
