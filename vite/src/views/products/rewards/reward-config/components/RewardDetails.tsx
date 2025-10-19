import { FormLabel } from "@/components/v2/form/FormLabel";
import { Input } from "@/components/v2/inputs/Input";
import { SheetSection } from "@/components/v2/sheets/SharedSheetComponents";
import { useAutoSlug } from "@/hooks/common/useAutoSlug";
import type { FrontendReward } from "../../types/frontendReward";

interface RewardDetailsProps {
	reward: FrontendReward;
	setReward: (reward: FrontendReward) => void;
}

export function RewardDetails({ reward, setReward }: RewardDetailsProps) {
	const { setSource, setTarget } = useAutoSlug({
		state: reward,
		setState: setReward,
		sourceKey: "name",
		targetKey: "id",
	});

	return (
		<SheetSection title="Reward Details">
			<div className="grid grid-cols-2 gap-2">
				<div>
					<FormLabel>Name</FormLabel>
					<Input
						placeholder="eg. Early Bird"
						value={reward.name}
						onChange={(e) => setSource(e.target.value)}
					/>
				</div>
				<div>
					<FormLabel>ID</FormLabel>
					<Input
						placeholder="eg. early_bird"
						value={reward.id}
						onChange={(e) => setTarget(e.target.value)}
					/>
				</div>
			</div>
		</SheetSection>
	);
}
