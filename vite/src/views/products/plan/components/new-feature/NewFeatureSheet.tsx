import { useState } from "react";
import { Button } from "@/components/v2/buttons/Button";
import { SheetHeader } from "@/components/v2/sheets/InlineSheet";
import { getDefaultFeature } from "@/views/products/features/utils/defaultFeature";
import { NewFeatureBehaviour } from "./NewFeatureBehaviour";
import { NewFeatureDetails } from "./NewFeatureDetails";
import { NewFeatureEventNames } from "./NewFeatureEventNames";
import { NewFeatureType } from "./NewFeatureType";

export function NewFeatureSheet() {
	const [feature, setFeature] = useState(getDefaultFeature());

	const handleCreateFeature = () => {};

	return (
		<div className="flex flex-col h-full">
			<SheetHeader
				title="New Feature"
				description="Configure how this feature is used in your app"
			/>

			<NewFeatureDetails feature={feature} setFeature={setFeature} />

			<NewFeatureType feature={feature} setFeature={setFeature} />

			<NewFeatureBehaviour feature={feature} setFeature={setFeature} />

			<NewFeatureEventNames feature={feature} setFeature={setFeature} />

			<div className="mt-auto p-4">
				<Button className="w-full" onClick={handleCreateFeature}>
					Create Feature
				</Button>
			</div>
		</div>
	);
}
