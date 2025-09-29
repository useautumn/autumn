import {
	type CreateFeature,
	FeatureType,
	FeatureUsageType,
} from "@autumn/shared";
import { PanelButton } from "@/components/v2/buttons/PanelButton";
import { BooleanIcon, UsageBasedIcon } from "@/components/v2/icons/AutumnIcons";
import { SheetSection } from "@/components/v2/sheets/InlineSheet";

export function NewFeatureBehaviour({
	feature,
	setFeature,
}: {
	feature: CreateFeature;
	setFeature: (feature: CreateFeature) => void;
}) {
	if (feature.type && feature.type !== FeatureType.Boolean)
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
								<div className="text-body-highlight mb-1">Single Use</div>
								<div className="text-body-secondary leading-tight">
									A feature that is consumed and refilled like 'credits' or 'API
									calls'
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
								icon={<BooleanIcon />}
							/>
							<div className="flex-1">
								<div className="text-body-highlight mb-1">Continuous Use</div>
								<div className="text-body-secondary leading-tight">
									A feature that is used on an ongoing basis, like 'seats' or
									'storage'
								</div>
							</div>
						</div>
					</div>
				</div>
			</SheetSection>
		);
}
