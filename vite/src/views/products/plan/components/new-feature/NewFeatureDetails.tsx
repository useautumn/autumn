import type { CreateFeature } from "@autumn/shared";
import { FormLabel } from "@/components/v2/form/FormLabel";
import { Input } from "@/components/v2/inputs/Input";
import { SheetSection } from "@/components/v2/sheets/InlineSheet";

export function NewFeatureDetails({
	feature,
	setFeature,
}: {
	feature: CreateFeature;
	setFeature: (feature: CreateFeature) => void;
}) {
	if (feature)
		return (
			<SheetSection title="Feature Details">
				<div className="space-y-4">
					<div className="grid grid-cols-2 gap-2">
						<div>
							<FormLabel>Name</FormLabel>
							<Input
								placeholder="eg. Messages"
								value={feature.name}
								onChange={(e) =>
									setFeature({ ...feature, name: e.target.value })
								}
							/>
						</div>

						<div>
							<FormLabel>ID</FormLabel>
							<Input
								placeholder="eg. messages"
								value={feature.id}
								onChange={(e) => setFeature({ ...feature, id: e.target.value })}
							/>
						</div>
					</div>
				</div>
			</SheetSection>
		);
}
