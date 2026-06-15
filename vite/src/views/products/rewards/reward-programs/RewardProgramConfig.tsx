import {
	type ProductV2,
	type Reward,
	type RewardProgram,
	RewardReceivedBy,
	RewardTriggerEvent,
} from "@autumn/shared";
import { PackageIcon, XIcon } from "@phosphor-icons/react";
import { useId } from "react";
import FieldLabel from "@/components/general/modal-components/FieldLabel";
import { Checkbox } from "@/components/v2/checkboxes/Checkbox";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/v2/dropdowns/DropdownMenu";
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
	const excludeTrialId = useId();

	return (
		<div className="flex flex-col gap-4">
			<div className="flex gap-2">
				<div className="w-full">
					<FieldLabel>Program ID</FieldLabel>
					<Input
						disabled={isUpdate}
						value={rewardProgram.id || ""}
						placeholder="Enter program ID"
						onChange={(e) =>
							setRewardProgram({ ...rewardProgram, id: e.target.value })
						}
					/>
				</div>
				<div className="w-full">
					<FieldLabel>Reward</FieldLabel>
				<Select
					value={rewardProgram.internal_reward_id}
					onValueChange={(value) =>
						setRewardProgram({ ...rewardProgram, internal_reward_id: value })
					}
					items={Object.fromEntries(rewards.map((reward: Reward) => [reward.internal_id, reward.name]))}
				>
						<SelectTrigger className="w-full">
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
			<div className="flex gap-2">
				<div className="w-full">
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
					items={Object.fromEntries(Object.values(RewardTriggerEvent).map((event) => [event, keyToTitle(event, { exclusionMap: { [RewardTriggerEvent.CustomerCreation]: "Customer Redemption" } })]))}
				>
						<SelectTrigger className="w-full">
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
				<div className="w-full">
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
				items={Object.fromEntries(Object.values(RewardReceivedBy).map((receivedBy) => [receivedBy, receivedBy === RewardReceivedBy.All ? "Referrer & Redeemer" : keyToTitle(receivedBy)]))}
			>
					<SelectTrigger className="w-full">
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
			{rewardProgram.when === RewardTriggerEvent.Checkout && (
				<>
					<div className="w-full">
						<FieldLabel>Products</FieldLabel>
						<ProductSelector
							rewardProgram={rewardProgram}
							setRewardProgram={setRewardProgram}
						/>
					</div>
					<div className="flex items-center gap-2">
						<Checkbox
							id={excludeTrialId}
							checked={rewardProgram.exclude_trial ?? false}
							onCheckedChange={(checked) =>
								setRewardProgram({
									...rewardProgram,
									exclude_trial: checked === true,
								})
							}
						/>
						<label
							htmlFor={excludeTrialId}
							className="text-sm text-tertiary-foreground cursor-pointer"
						>
							Exclude trials
						</label>
					</div>
				</>
			)}
		</div>
	);
};

const MAX_VISIBLE_CHIPS = 3;

const ProductSelector = ({
	rewardProgram,
	setRewardProgram,
}: {
	rewardProgram: RewardProgram;
	setRewardProgram: (rewardProgram: RewardProgram) => void;
}) => {
	const { products } = useProductsQuery();

	const productIds = rewardProgram.product_ids ?? [];

	const toggleProduct = (productId: string) =>
		setRewardProgram({
			...rewardProgram,
			product_ids: productIds.includes(productId)
				? productIds.filter((id) => id !== productId)
				: [...productIds, productId],
		});

	if (!products || products.length === 0) {
		return (
			<p className="text-sm text-tertiary-foreground">No products available</p>
		);
	}

	const getProductName = (productId: string) =>
		products.find((p: ProductV2) => p.id === productId)?.name ?? "Unknown plan";

	return (
		<div className="min-w-0 w-full">
			<DropdownMenu>
				<DropdownMenuTrigger className="flex h-8 w-full min-w-0 cursor-pointer items-center gap-1.5 overflow-hidden rounded-xl px-3 input-base input-state-open-tiny text-sm">
					{productIds.length === 0 ? (
						<span className="text-tertiary-foreground">Select plans...</span>
					) : (
						<>
							{productIds.slice(0, MAX_VISIBLE_CHIPS).map((productId) => (
								<span
									className="flex h-4.5 max-w-48 shrink-0 items-center gap-0.5 rounded border border-border bg-accent px-1 text-[10px] text-foreground"
									key={productId}
								>
									<span className="shrink-0 [&_svg]:size-3">
										<PackageIcon
											className="text-tertiary-foreground"
											size={12}
											weight="duotone"
										/>
									</span>
									<span className="truncate">{getProductName(productId)}</span>
									<span
										className="ml-0.5 cursor-pointer text-tertiary-foreground hover:text-destructive"
										onClick={(e) => {
											e.stopPropagation();
											toggleProduct(productId);
										}}
										onPointerDown={(e) => e.stopPropagation()}
									>
										<XIcon size={10} />
									</span>
								</span>
							))}
							{productIds.length > MAX_VISIBLE_CHIPS && (
								<span className="shrink-0 px-1 text-sm text-tertiary-foreground">
									+{productIds.length - MAX_VISIBLE_CHIPS}
								</span>
							)}
						</>
					)}
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start" className="w-64">
					<div className="max-h-72 overflow-y-auto">
						{products.map((product: ProductV2) => (
							<DropdownMenuItem
								className="flex cursor-pointer items-center gap-2 font-medium"
								closeOnClick={false}
								key={product.id}
								onClick={(e) => {
									e.preventDefault();
									toggleProduct(product.id);
								}}
							>
								<Checkbox
									checked={productIds.includes(product.id)}
									className="border-border"
								/>
								<span className="truncate">{product.name}</span>
							</DropdownMenuItem>
						))}
					</div>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
};
