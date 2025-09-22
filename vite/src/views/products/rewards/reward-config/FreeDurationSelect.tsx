import { CouponDurationType, type Reward } from "@autumn/shared";
import FieldLabel from "@/components/general/modal-components/FieldLabel";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { keyToTitle } from "@/utils/formatUtils/formatTextUtils";

export const FreeDurationSelect = ({
	reward,
	setReward,
}: {
	reward: Reward;
	setReward: (reward: Reward) => void;
}) => {
	return (
		<div className="w-full">
			<FieldLabel>Duration</FieldLabel>
			<div className="flex items-center gap-2">
				{
					<Input
						className="no-spinner"
						value={Number(reward.free_product_config?.duration_value) || ""}
						onChange={(e) => {
							setReward({
								...reward,
								// @ts-expect-error
								free_product_config: {
									...(reward.free_product_config ?? {}),
									duration_value: Number(e.target.value),
								},
							});
						}}
						type="number"
						min={1}
						max={12}
					/>
				}
				<Select
					value={
						reward.free_product_config?.duration_type ||
						CouponDurationType.Months
					}
					onValueChange={(value) =>
						setReward({
							...reward,
							// @ts-expect-error
							free_product_config: {
								...(reward.free_product_config ?? {}),
								duration_type: value as CouponDurationType,
							},
						})
					}
				>
					<SelectTrigger>
						<SelectValue placeholder="Select a duration" />
					</SelectTrigger>
					<SelectContent>
						{Object.values(CouponDurationType)
							.filter((x) => x !== CouponDurationType.Forever)
							.filter((x) => x !== CouponDurationType.OneOff)
							.map((type) => (
								<SelectItem key={type} value={type}>
									{keyToTitle(type)}
								</SelectItem>
							))}
					</SelectContent>
				</Select>
			</div>
		</div>
	);
};
