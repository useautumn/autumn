import { XIcon } from "@phosphor-icons/react";
import { CheckIcon } from "lucide-react";
import { IconButton } from "@/components/v2/buttons/IconButton";
import { SearchableSelect } from "@/components/v2/selects/SearchableSelect";
import { useRewardsQuery } from "@/hooks/queries/useRewardsQuery";
import { useStripeCouponsQuery } from "@/hooks/queries/useStripeCouponsQuery";
import { useAttachFormContext } from "../context/AttachFormProvider";
import { buildDiscountOptions } from "../utils/discountOptionUtils";
import { removeDiscount, updateDiscount } from "../utils/discountUtils";

interface AttachDiscountRowProps {
	index: number;
}

export function AttachDiscountRow({ index }: AttachDiscountRowProps) {
	const { form, formValues, product } = useAttachFormContext();
	const { rewards, rewardPrograms } = useRewardsQuery();
	const { stripeCoupons } = useStripeCouponsQuery();

	const discounts = formValues.discounts;
	const discount = discounts[index];

	if (!discount) return null;

	const allOptions = buildDiscountOptions({
		rewards,
		rewardPrograms,
		stripeCoupons,
		productId: product?.id,
	});

	// Get reward IDs already selected in other rows
	const selectedRewardIds = discounts
		.filter((d, i) => i !== index && "reward_id" in d)
		.map((d) => ("reward_id" in d ? d.reward_id : ""))
		.filter(Boolean);

	// Filter out already-selected options
	const availableOptions = allOptions.filter(
		(o) => !selectedRewardIds.includes(o.id),
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

	const currentRewardId =
		"reward_id" in discount ? (discount.reward_id ?? "") : "";

	return (
		<div className="flex items-center gap-2 h-8">
			{/* Reward select */}
			<div className="flex-1 min-w-0">
				<SearchableSelect
					value={currentRewardId}
					onValueChange={handleRewardChange}
					options={availableOptions}
					getOptionValue={(o) => o.id}
					getOptionLabel={(o) => o.label}
					placeholder="Select discount..."
					searchable
					searchPlaceholder="Search discounts..."
					emptyText="No discounts found"
					triggerClassName="h-7 px-2 text-xs border-0 shadow-none bg-transparent hover:bg-muted/50"
					renderOption={(option, isSelected) => (
						<>
							<span className="flex-1 truncate min-w-0">{option.label}</span>
							{option.sublabel && (
								<span className="text-t3 text-xs shrink-0">
									{option.sublabel}
								</span>
							)}
							{isSelected && <CheckIcon className="size-4 shrink-0" />}
						</>
					)}
					renderValue={(option) => {
						if (!option)
							return <span className="text-t3">Select discount...</span>;
						return (
							<span className="flex items-center gap-2">
								<span className="truncate">{option.label}</span>
								{option.sublabel && (
									<span className="text-t3 text-xs shrink-0">
										{option.sublabel}
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
