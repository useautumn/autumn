import { type CreateFeature, FeatureType } from "@autumn/shared";
import {
	FormLabel,
	SheetAccordion,
	SheetAccordionItem,
	TagInput,
} from "@autumn/ui";

export function NewFeatureAdvanced({
	feature,
	setFeature,
}: {
	feature: CreateFeature;
	setFeature: (feature: CreateFeature) => void;
}) {
	const showEventNames =
		feature.type === FeatureType.Metered && Boolean(feature.config?.usage_type);

	if (!showEventNames) return null;

	return (
		<SheetAccordion type="single" withSeparator={false} collapsible={true}>
			<SheetAccordionItem value="advanced" title="Advanced">
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
						<span className="text-tiny text-tertiary-foreground">
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
			</SheetAccordionItem>
		</SheetAccordion>
	);
}
