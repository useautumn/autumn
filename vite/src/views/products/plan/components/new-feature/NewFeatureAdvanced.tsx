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
	const showAdvanced =
		feature.type &&
		feature.config?.usage_type &&
		feature.type !== FeatureType.Boolean;

	if (!showAdvanced) return null;

	return (
		<SheetAccordion type="single" withSeparator={false} collapsible={true}>
			<SheetAccordionItem value="advanced" title="Advanced">
				<div className="space-y-4">
					<div className="space-y-4">
						<div className="flex flex-col w-full gap-1">
							<FormLabel>Event Names (optional)</FormLabel>
							<TagInput
								placeholder="eg. chat-messages"
								value={feature.event_names}
								onChange={(tags) =>
									setFeature({
										...feature,
										event_names: tags,
									})
								}
							/>
							<span className="text-tiny text-t3">
								Event names are only required if you want to link one event from
								your application to multiple feature balances. Read more{" "}
								<a
									href="https://docs.useautumn.com/documentation/customers/tracking-usage#using-event-names"
									target="_blank"
									rel="noreferrer"
									className="text-primary underline"
								>
									here.
								</a>
							</span>
						</div>
					</div>
				</div>
			</SheetAccordionItem>
		</SheetAccordion>
	);
}
