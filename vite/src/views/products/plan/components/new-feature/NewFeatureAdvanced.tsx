import { type CreateFeature, FeatureType } from "@autumn/shared";
import { FormLabel } from "@/components/v2/form/FormLabel";
import { TagInput } from "@/components/v2/inputs/TagInput";
import {
	SheetAccordion,
	SheetAccordionItem,
} from "@/components/v2/sheets/SheetAccordion";

export function NewFeatureAdvanced({
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
			<SheetAccordion type="single" withSeparator={false} collapsible={true}>
				<SheetAccordionItem value="advanced" title="Advanced">
					<div className="space-y-4">
						<div className="space-y-4">
							<div className="flex flex-col w-full gap-1">
								<FormLabel>Event Names (optional)</FormLabel>
								<TagInput
									placeholder="eg. chat-messages"
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
				</SheetAccordionItem>
			</SheetAccordion>
		);
}
