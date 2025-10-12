import {
	type CreateFeature,
	FeatureType,
	FeatureUsageType,
} from "@autumn/shared";
import { InfoIcon, TicketIcon } from "@phosphor-icons/react";
import { PanelButton } from "@/components/v2/buttons/PanelButton";
import { UsageBasedIcon } from "@/components/v2/icons/AutumnIcons";
import { SheetSection } from "@/components/v2/sheets/InlineSheet";

export function NewFeatureBehaviour({
	feature,
	setFeature,
}: {
	feature: CreateFeature;
	setFeature: (feature: CreateFeature) => void;
}) {
	if (feature.type && feature.type !== FeatureType.Boolean) {
		return (
			<SheetSection title="Feature Behavior">
				<div className="space-y-4">
					<div className="mt-3 space-y-4">
						<div className="flex w-full items-center gap-4">
							<PanelButton
								isSelected={
									feature.config?.usage_type === FeatureUsageType.Single
								}
								onClick={() => {
									setFeature({
										...feature,
										config: {
											...feature.config,
											usage_type: FeatureUsageType.Single,
										},
									});
								}}
								icon={<UsageBasedIcon color="currentColor" />}
							/>
							<div className="flex-1">
								<div className="text-body-highlight mb-1 flex-row flex items-center gap-1">
									Consumable
									<InfoIcon size={8} weight="regular" color="#888888" />
								</div>
								<div className="text-body-secondary leading-tight">
									Used in units and can be refilled (e.g., API calls, tokens or
									messages in an AI Chatbot)
								</div>
							</div>
						</div>

						<div className="flex w-full items-center gap-4">
							<PanelButton
								isSelected={
									feature.config?.usage_type === FeatureUsageType.Continuous
								}
								onClick={() => {
									setFeature({
										...feature,
										config: {
											...feature.config,
											usage_type: FeatureUsageType.Continuous,
										},
									});
								}}
								icon={<TicketIcon size={16} color="currentColor" />}
							/>
							<div className="flex-1">
								<div className="text-body-highlight mb-1 flex-row flex items-center gap-1">
									Allocated
									<InfoIcon size={8} weight="regular" color="#888888" />
								</div>
								<div className="text-body-secondary leading-tight">
									Fixed usage limits that reset monthly (e.g., 5 seats, 10 GB
									storage)
								</div>
							</div>
						</div>
					</div>
				</div>
			</SheetSection>
		);
	}
}
