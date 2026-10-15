import {
	type CreateFeature,
	FeatureCombine,
	FeatureType,
} from "@autumn/shared";
import {
	FormLabel,
	GroupedTabButton,
	SheetAccordion,
	SheetAccordionItem,
	TagInput,
} from "@autumn/ui";

const combineOptions = [
	{ value: FeatureCombine.Sum, label: "Sum" },
	{ value: FeatureCombine.Max, label: "Max" },
	{ value: FeatureCombine.Min, label: "Min" },
];

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
					<div className="flex items-center justify-between w-full gap-4">
						<FormLabel className="mb-0">Combine across plans</FormLabel>
						<GroupedTabButton
							value={feature.config?.combine ?? FeatureCombine.Sum}
							onValueChange={(combine) =>
								setFeature({
									...feature,
									config: {
										...feature.config,
										combine: combine as FeatureCombine,
									},
								})
							}
							options={combineOptions}
							className="w-44"
						/>
					</div>
				</div>
			</SheetAccordionItem>
		</SheetAccordion>
	);
}
