import {
	FeatureType as APIFeatureType,
	type CreateFeature,
} from "@autumn/shared";
import { BarcodeIcon, InfoIcon } from "@phosphor-icons/react";
import { WarningBox } from "@/components/general/modal-components/WarningBox";
import { PanelButton } from "@/components/v2/buttons/PanelButton";
import { BooleanIcon } from "@/components/v2/icons/AutumnIcons";
import { SheetSection } from "@/components/v2/sheets/InlineSheet";

export function NewFeatureType({
	feature,
	setFeature,
	isOnboarding,
}: {
	feature: CreateFeature;
	setFeature: (feature: CreateFeature) => void;
	isOnboarding?: boolean;
}) {
	if (!feature) return null;

	const showBooleanWarning =
		isOnboarding && feature.type === APIFeatureType.Boolean;

	// Hide separator when this is the last section (Boolean features)
	const isLastSection = feature.type === APIFeatureType.Boolean;

	return (
		<SheetSection title="Feature Type" withSeparator={!isLastSection}>
			<div className="space-y-4">
				<div className="mt-3 space-y-4">
					<div className="flex w-full items-center gap-4">
						<PanelButton
							isSelected={feature.type === APIFeatureType.Metered}
							onClick={() => {
								setFeature({ ...feature, type: APIFeatureType.Metered });
							}}
							icon={<BarcodeIcon size={16} color="currentColor" />}
						/>
						<div className="flex-1">
							<div className="text-body-highlight mb-1 flex-row flex items-center gap-1">
								Metered
								<InfoIcon size={8} weight="regular" color="#888888" />
							</div>
							<div className="text-body-secondary leading-tight">
								A usage-based feature that you want to track
							</div>
						</div>
					</div>

					<div className="flex w-full items-center gap-4">
						<PanelButton
							isSelected={feature.type === APIFeatureType.Boolean}
							onClick={() => {
								setFeature({ ...feature, type: APIFeatureType.Boolean });
							}}
							icon={<BooleanIcon />}
						/>
						<div className="flex-1">
							<div className="text-body-highlight mb-1 flex-row flex items-center gap-1">
								Boolean
								<InfoIcon size={8} weight="regular" color="#888888" />
							</div>
							<div className="text-body-secondary leading-tight">
								A flag that can either be enabled or disabled.
							</div>
						</div>
					</div>
				</div>

				{showBooleanWarning && (
					<WarningBox>
						Boolean features don't have prices or limits so you will skip the
						next step of the onboarding. It is recommended to create a metered
						feature in this step.
					</WarningBox>
				)}
			</div>
		</SheetSection>
	);
}
