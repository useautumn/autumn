import {
	FeatureType as APIFeatureType,
	type CreateFeature,
} from "@autumn/shared";
import { BarcodeIcon, InfoIcon } from "@phosphor-icons/react";
import { PanelButton } from "@/components/v2/buttons/PanelButton";
import { BooleanIcon } from "@/components/v2/icons/AutumnIcons";
import { SheetSection } from "@/components/v2/sheets/InlineSheet";

export function NewFeatureType({
	feature,
	setFeature,
}: {
	feature: CreateFeature;
	setFeature: (feature: CreateFeature) => void;
}) {
	if (!feature) return null;

	return (
		<SheetSection title="Feature Type">
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
								A feature flag that can be either enabled or disabled
							</div>
						</div>
					</div>
				</div>
			</div>
		</SheetSection>
	);
}
