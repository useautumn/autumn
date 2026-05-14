import { FeatureSearchDropdown } from "@/components/v2/dropdowns/FeatureSearchDropdown";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { cn } from "@/lib/utils";
import { RemoveButton } from "../shared/RemoveButton";

export function RemoveItemRows({
	item,
	onChange,
	onRemove,
}: {
	item: Record<string, unknown>;
	onChange: (item: Record<string, unknown>) => void;
	onRemove: () => void;
}) {
	const { features } = useFeaturesQuery();
	const featureId = (item.feature_id as string) || null;

	return (
		<div className="flex items-center gap-2 group/row">
			<span className="text-xs text-t4 w-14 shrink-0 select-none">Remove</span>
			<FeatureSearchDropdown
				features={features}
				value={featureId}
				onSelect={(v) => onChange({ ...item, feature_id: v })}
				placeholder="Select feature to remove..."
				triggerClassName={cn(
					featureId && "!border-destructive/50 hover:!border-destructive/60",
				)}
			/>
			<RemoveButton onClick={onRemove} />
		</div>
	);
}
