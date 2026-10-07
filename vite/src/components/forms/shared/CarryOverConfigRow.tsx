import type { Feature } from "@autumn/shared";
import { Switch } from "@autumn/ui";
import { ConfigRow } from "@/components/forms/shared/ConfigRow";
import type { CarryOverFormValue } from "@/components/forms/shared/utils/carryOverParam";
import { ValuePicker } from "@/components/v2/rule-builder/ValuePicker";
import { getFeatureIcon } from "@/views/products/features/utils/getFeatureIcon";

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
	const setFeatureIds = (featureIds: string[]) =>
		onChange({ enabled: value.enabled, featureIds });
	const removeFeature = (featureId: string) =>
		setFeatureIds(value.featureIds.filter((id) => id !== featureId));

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
			<ValuePicker
				suggestions={features.map((feature) => ({
					value: feature.id,
					label: feature.name,
					icon: getFeatureIcon({ feature, size: 12 }),
				}))}
				selectedValues={value.featureIds}
				onToggle={(featureId) =>
					value.featureIds.includes(featureId)
						? removeFeature(featureId)
						: setFeatureIds([...value.featureIds, featureId])
				}
				onRemove={removeFeature}
				placeholder="All features"
			/>
		</ConfigRow>
	);
}
