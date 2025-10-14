import {
	type ProductV2,
	type Reward,
	type RewardProgram,
	RewardReceivedBy,
	RewardTriggerEvent,
} from "@autumn/shared";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { useState } from "react";
import FieldLabel from "@/components/general/modal-components/FieldLabel";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/v2/buttons/Button";
import { Input } from "@/components/v2/inputs/Input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/v2/selects/Select";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useRewardsQuery } from "@/hooks/queries/useRewardsQuery";
import { keyToTitle } from "@/utils/formatUtils/formatTextUtils";

export const RewardProgramConfig = ({
	rewardProgram,
	setRewardProgram,
	isUpdate,
}: {
	rewardProgram: RewardProgram;
	setRewardProgram: (rewardProgram: RewardProgram) => void;
	isUpdate?: boolean;
}) => {
	const { rewards } = useRewardsQuery();

	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-center gap-2">
				<div className="w-6/12">
					<FieldLabel>Program ID</FieldLabel>
					<Input
						disabled={isUpdate}
						value={rewardProgram.id || ""}
						onChange={(e) =>
							setRewardProgram({ ...rewardProgram, id: e.target.value })
						}
					/>
				</div>
				<div className="w-6/12">
					<FieldLabel>Reward</FieldLabel>
					<Select
						value={rewardProgram.internal_reward_id}
						onValueChange={(value) =>
							setRewardProgram({ ...rewardProgram, internal_reward_id: value })
						}
					>
						<SelectTrigger>
							<SelectValue placeholder="Select a reward" />
						</SelectTrigger>
						<SelectContent>
							{rewards.map((reward: Reward) => (
								<SelectItem key={reward.name} value={reward.internal_id}>
									{reward.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</div>
			<div className="flex items-center gap-2">
				<div className="w-6/12">
					<FieldLabel>Redeem On</FieldLabel>
					<Select
						defaultValue={RewardTriggerEvent.CustomerCreation}
						value={rewardProgram.when}
						onValueChange={(value) =>
							setRewardProgram({
								...rewardProgram,
								when: value as RewardTriggerEvent,
							})
						}
					>
						<SelectTrigger>
							<SelectValue placeholder="Select a redeem on" />
						</SelectTrigger>
						<SelectContent>
							{Object.values(RewardTriggerEvent).map((event) => (
								<SelectItem key={event} value={event}>
									{keyToTitle(event, {
										exclusionMap: {
											[RewardTriggerEvent.CustomerCreation]:
												"Customer Redemption",
										},
									})}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<div className="w-6/12">
					<FieldLabel>Max Redemptions</FieldLabel>
					<Input
						type="number"
						value={rewardProgram.max_redemptions}
						onChange={(e) =>
							setRewardProgram({
								...rewardProgram,
								max_redemptions: parseInt(e.target.value),
							})
						}
					/>
				</div>
			</div>
			<div className="flex items-center gap-2">
				<div className="w-full">
					<FieldLabel>Received by</FieldLabel>
					<Select
						value={rewardProgram.received_by}
						onValueChange={(value) =>
							setRewardProgram({
								...rewardProgram,
								received_by: value as RewardReceivedBy,
							})
						}
					>
						<SelectTrigger>
							<SelectValue placeholder="Who should receive the reward" />
						</SelectTrigger>
						<SelectContent>
							{Object.values(RewardReceivedBy).map((receivedBy) => (
								<SelectItem key={receivedBy} value={receivedBy}>
									{receivedBy === RewardReceivedBy.All
										? "Referrer & Redeemer"
										: keyToTitle(receivedBy)}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</div>
			<div className="flex items-center gap-2">
				{rewardProgram.when === RewardTriggerEvent.Checkout && (
					<div className="w-full">
						<FieldLabel>Products</FieldLabel>
						<ProductSelector
							rewardProgram={rewardProgram}
							setRewardProgram={setRewardProgram}
						/>
					</div>
				)}
			</div>
		</div>
	);
};

const ProductSelector = ({
	rewardProgram,
	setRewardProgram,
}: {
	rewardProgram: RewardProgram;
	setRewardProgram: (rewardProgram: RewardProgram) => void;
}) => {
	const { products } = useProductsQuery();
	const [open, setOpen] = useState(false);

	// Handle selection/deselection of a product
	const handleProductToggle = (productId: string) => {
		let newProductIds = [...(rewardProgram.product_ids || [])];
		if (newProductIds.includes(productId)) {
			newProductIds = newProductIds.filter((id) => id !== productId);
		} else {
			newProductIds = [...newProductIds, productId];
		}
		setRewardProgram({
			...rewardProgram,
			product_ids: newProductIds,
		});
	};

	if (!products || products.length === 0) {
		return <p className="text-sm text-t3">No products available</p>;
	}

	const getProductText = (productId: string) => {
		const product = products.find((p: ProductV2) => p.id === productId);
		return product?.name || "Unknown Product";
	};

	return (
		<Popover modal open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					variant="muted"
					role="combobox"
					aria-expanded={open}
					className="w-full min-h-9 flex flex-wrap h-fit py-2 justify-start items-center gap-2 relative hover:bg-zinc-50 data-[state=open]:border-focus data-[state=open]:shadow-focus"
				>
					{rewardProgram.product_ids?.length === 0
						? "Select Products"
						: rewardProgram.product_ids?.map((productId: string) => (
								<div
									key={productId}
									className="py-0 px-3 text-xs text-t3 border-zinc-300 bg-zinc-100 rounded-full w-fit flex items-center gap-2 h-fit"
								>
									<p className="text-t2">{getProductText(productId)}</p>
									<Button
										variant="skeleton"
										size="sm"
										onClick={(e) => {
											e.stopPropagation();
											handleProductToggle(productId);
										}}
										className="bg-transparent hover:bg-transparent p-0 w-5 h-5"
									>
										<X size={12} className="text-t3" />
									</Button>
								</div>
							))}
					<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50 absolute right-2" />
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-[400px] p-0" align="start">
				<Command>
					<CommandInput placeholder="Search products..." className="h-9" />
					<CommandList className="max-h-[300px] overflow-y-auto">
						<ScrollArea>
							<CommandEmpty>No products found.</CommandEmpty>
							<CommandGroup>
								{products.map((product: ProductV2) => (
									<CommandItem
										key={product.id}
										value={product.id}
										onSelect={() => handleProductToggle(product.id)}
										className="cursor-pointer"
									>
										<div className="flex items-center">{product.name}</div>
										{rewardProgram.product_ids?.includes(product.id) && (
											<Check size={12} className="text-t3" />
										)}
									</CommandItem>
								))}
							</CommandGroup>
						</ScrollArea>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
};
