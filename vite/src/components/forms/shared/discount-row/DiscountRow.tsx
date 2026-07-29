import { IconButton, SearchableSelect } from "@autumn/ui";
import { XIcon } from "@phosphor-icons/react";
import { CheckIcon } from "lucide-react";
import {
	buildDiscountOptions,
	type DiscountOption,
} from "@/components/forms/attach-v2/utils/discountOptionUtils";
import type { FormDiscount } from "@/components/forms/attach-v2/utils/discountUtils";
import { useRewardsQuery } from "@/hooks/queries/useRewardsQuery";
import { useStripeCouponsQuery } from "@/hooks/queries/useStripeCouponsQuery";

export function DiscountRow({
	discounts,
	index,
	productId,
	onUpdate,
	onRemove,
}: {
	discounts: FormDiscount[];
	index: number;
	productId: string | undefined;
	onUpdate: ({ rewardId }: { rewardId: string }) => void;
	onRemove: () => void;
}) {
	const { rewards, rewardPrograms } = useRewardsQuery();
	const { stripeCoupons } = useStripeCouponsQuery();

	const discount = discounts[index];
	if (!discount) return null;

	const allOptions = buildDiscountOptions({
		rewards,
		rewardPrograms,
		stripeCoupons,
		productId,
	});

	const selectedRewardIds = discounts
		.filter((d, i) => i !== index && "reward_id" in d)
		.map((d) => ("reward_id" in d ? d.reward_id : ""))
		.filter(Boolean);

	const availableOptions = allOptions.filter(
		(o) => !selectedRewardIds.includes(o.id),
	);

	const currentRewardId =
		"reward_id" in discount ? (discount.reward_id ?? "") : "";

	return (
		<div className="flex items-center gap-2 h-8">
			<div className="flex-1 min-w-0">
				<SearchableSelect
					value={currentRewardId}
					onValueChange={(rewardId) => onUpdate({ rewardId })}
					options={availableOptions}
					getOptionValue={(o: DiscountOption) => o.id}
					getOptionLabel={(o: DiscountOption) => o.label}
					placeholder="Select discount..."
					searchable
					searchPlaceholder="Search discounts..."
					emptyText="No discounts found"
					triggerClassName="h-7 px-2 text-xs border-0 shadow-none bg-transparent hover:bg-muted/50"
					renderOption={(option: DiscountOption, isSelected: boolean) => (
						<>
							<span className="flex-1 truncate min-w-0">{option.label}</span>
							{option.sublabel && (
								<span className="text-tertiary-foreground text-xs shrink-0">
									{option.sublabel}
								</span>
							)}
							{isSelected && <CheckIcon className="size-4 shrink-0" />}
						</>
					)}
					renderValue={(option: DiscountOption | undefined) => {
						if (!option)
							return (
								<span className="text-tertiary-foreground">
									Select discount...
								</span>
							);
						return (
							<span className="flex items-center gap-2">
								<span className="truncate">{option.label}</span>
								{option.sublabel && (
									<span className="text-tertiary-foreground text-xs shrink-0">
										{option.sublabel}
									</span>
								)}
							</span>
						);
					}}
				/>
			</div>

			<IconButton
				variant="muted"
				size="sm"
				onClick={onRemove}
				icon={<XIcon size={12} />}
				className="shrink-0 text-tertiary-foreground hover:text-red-500"
			/>
		</div>
	);
}
