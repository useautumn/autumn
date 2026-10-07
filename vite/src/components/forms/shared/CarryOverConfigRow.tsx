import type { Feature } from "@autumn/shared";
import { Switch } from "@autumn/ui";
import { ConfigRow } from "@/components/forms/shared/ConfigRow";
import { FeatureSelectDropdown } from "@/components/forms/shared/FeatureSelectDropdown";
import type { CarryOverFormValue } from "@/components/forms/shared/utils/carryOverParam";

export function CarryOverConfigRow({
	title,
	description,
	features,
	value,
	onChange,
}: {
	title: string;
	description: string;
	features: Feature[];
	value: CarryOverFormValue;
	onChange: (value: CarryOverFormValue) => void;
}) {
	return (
		<ConfigRow
			title={title}
			description={description}
			expanded={value.enabled}
			action={
				<Switch
					aria-label={title}
					checked={value.enabled}
					onCheckedChange={(checked) =>
						onChange({
							enabled: checked,
							featureIds: checked ? value.featureIds : [],
						})
					}
				/>
			}
		>
			<FeatureSelectDropdown
				features={features}
				selectedFeatureIds={value.featureIds}
				onChange={({ featureIds }) =>
					onChange({ enabled: value.enabled, featureIds })
				}
			/>
		</ConfigRow>
	);
}
