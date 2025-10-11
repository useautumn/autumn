import { type Feature, FeatureUsageType } from "@autumn/shared";
import FieldLabel from "@/components/general/modal-components/FieldLabel";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";

export const EntityConfig = ({
	entity,
	setEntity,
}: {
	entity: any;
	setEntity: (entity: any) => void;
}) => {
	const { features } = useFeaturesQuery();

	return (
		<>
			<div className="flex gap-2">
				<div>
					<FieldLabel>Name</FieldLabel>
					<Input
						value={entity.name}
						onChange={(e) => setEntity({ ...entity, name: e.target.value })}
					/>
				</div>
				<div>
					<FieldLabel>ID</FieldLabel>
					<Input
						value={entity.id}
						onChange={(e) => setEntity({ ...entity, id: e.target.value })}
					/>
				</div>
			</div>
			<div>
				<FieldLabel>Feature ID</FieldLabel>
				<Select
					value={entity.feature_id}
					onValueChange={(value) => setEntity({ ...entity, feature_id: value })}
				>
					<SelectTrigger>
						<SelectValue placeholder="Select feature" />
					</SelectTrigger>
					<SelectContent>
						{features
							.filter(
								(feature: Feature) =>
									feature.usage_type == FeatureUsageType.ContinuousUse,
							)
							.map((feature: Feature) => (
								<SelectItem key={feature.id} value={feature.id}>
									{feature.name}
								</SelectItem>
							))}
					</SelectContent>
				</Select>
			</div>
		</>
	);
};
