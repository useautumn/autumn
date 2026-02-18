import type { Reward } from "@autumn/shared";
import { filterRewardsByProduct, RewardType } from "@autumn/shared";
import { XIcon } from "@phosphor-icons/react";
import { CheckIcon } from "lucide-react";
import { IconButton } from "@/components/v2/buttons/IconButton";
import { SearchableSelect } from "@/components/v2/selects/SearchableSelect";
import { useRewardsQuery } from "@/hooks/queries/useRewardsQuery";
import { useAttachFormContext } from "../context/AttachFormProvider";
import { removeDiscount, updateDiscount } from "../utils/discountUtils";

interface AttachDiscountRowProps {
	index: number;
}

/** Filters rewards to only show discount types (not free products) */
const filterDiscountRewards = (rewards: Reward[]): Reward[] => {
	return rewards.filter(
		(r) =>
			r.type === RewardType.PercentageDiscount ||
			r.type === RewardType.FixedDiscount,
	);
};

export function AttachDiscountRow({ index }: AttachDiscountRowProps) {
	const { form, formValues, product } = useAttachFormContext();
	const { rewards, rewardPrograms } = useRewardsQuery();

	const discounts = formValues.discounts;
	const discount = discounts[index];

	if (!discount) return null;

	const discountRewards = filterDiscountRewards(rewards);
	const productFilteredRewards = filterRewardsByProduct({
		rewards: discountRewards,
		rewardPrograms,
		productId: product?.id,
	});

	// Get reward IDs already selected in other rows
	const selectedRewardIds = discounts
		.filter((d, i) => i !== index && "reward_id" in d)
		.map((d) => ("reward_id" in d ? d.reward_id : ""))
		.filter(Boolean);

	// Filter out already-selected rewards
	const availableRewards = productFilteredRewards.filter(
		(r) => !selectedRewardIds.includes(r.id),
	);

	const handleRewardChange = (rewardId: string) => {
		form.setFieldValue(
			"discounts",
			updateDiscount(discounts, index, { reward_id: rewardId }),
		);
	};

	const handleRemove = () => {
		form.setFieldValue("discounts", removeDiscount(discounts, index));
	};

	const currentRewardId = "reward_id" in discount ? discount.reward_id : "";

	return (
		<div className="flex items-center gap-2 h-8">
			{/* Reward select */}
			<div className="flex-1 min-w-0">
				<SearchableSelect
					value={currentRewardId}
					onValueChange={handleRewardChange}
					options={availableRewards}
					getOptionValue={(r) => r.id}
					getOptionLabel={(r) => r.name || r.id}
					placeholder="Select reward..."
					searchable
					searchPlaceholder="Search rewards..."
					emptyText="No rewards found"
					triggerClassName="h-7 px-2 text-xs border-0 shadow-none bg-transparent hover:bg-muted/50"
					renderOption={(reward, isSelected) => (
						<>
							<span className="flex-1 truncate min-w-0">
								{reward.name || reward.id}
							</span>
							{reward.promo_codes?.[0]?.code && (
								<span className="text-t3 text-xs shrink-0">
									{reward.promo_codes[0].code}
								</span>
							)}
							{isSelected && <CheckIcon className="size-4 shrink-0" />}
						</>
					)}
					renderValue={(reward) => {
						if (!reward)
							return <span className="text-t3">Select reward...</span>;
						return (
							<span className="flex items-center gap-2">
								<span className="truncate">{reward.name || reward.id}</span>
								{reward.promo_codes?.[0]?.code && (
									<span className="text-t3 text-xs shrink-0">
										{reward.promo_codes[0].code}
									</span>
								)}
							</span>
						);
					}}
				/>
			</div>

			{/* Remove button */}
			<IconButton
				variant="muted"
				size="sm"
				onClick={handleRemove}
				icon={<XIcon size={12} />}
				className="shrink-0 text-t3 hover:text-red-500"
			/>
		</div>
	);
}
