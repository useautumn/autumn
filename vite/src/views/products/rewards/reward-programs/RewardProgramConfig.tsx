import {
	type ProductV2,
	type Reward,
	type RewardProgram,
	RewardReceivedBy,
	RewardTriggerEvent,
	RewardType,
} from "@autumn/shared";
import {
	Checkbox,
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	FieldLabel,
	Input,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@autumn/ui";
import { useId } from "react";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useRewardsQuery } from "@/hooks/queries/useRewardsQuery";
import { keyToTitle } from "@/utils/formatUtils/formatTextUtils";
import { ChipSelectTrigger } from "../components/ChipSelectTrigger";

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

	// Legacy programs may point at other reward types, so keep the current one selectable
	const selectableRewards = rewards.filter(
		(reward: Reward) =>
			reward.type === RewardType.FeatureGrant ||
			reward.internal_id === rewardProgram.internal_reward_id,
	);

	return (
		<div className="flex flex-col gap-4">
			<div className="flex gap-2">
				<div className="min-w-0 flex-1">
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
				<div className="min-w-0 flex-1">
					<FieldLabel>Reward</FieldLabel>
					<Select
						value={rewardProgram.internal_reward_id}
						onValueChange={(value) =>
							setRewardProgram({ ...rewardProgram, internal_reward_id: value })
						}
						items={Object.fromEntries(
							selectableRewards.map((reward: Reward) => [
								reward.internal_id,
								reward.name,
							]),
						)}
					>
						<SelectTrigger className="w-full">
							<SelectValue placeholder="Select a reward" />
						</SelectTrigger>
						<SelectContent className="w-[var(--anchor-width)]">
							{selectableRewards.map((reward: Reward) => (
								<SelectItem
									className="min-w-0 pr-6 [&>div]:min-w-0"
									key={reward.name}
									value={reward.internal_id}
								>
									<span className="truncate">{reward.name}</span>
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</div>
			<div className="flex gap-2">
				<div className="min-w-0 flex-1">
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
						items={Object.fromEntries(
							Object.values(RewardTriggerEvent).map((event) => [
								event,
								keyToTitle(event, {
									exclusionMap: {
										[RewardTriggerEvent.CustomerCreation]:
											"Customer Redemption",
									},
								}),
							]),
						)}
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
				<div className="min-w-0 flex-1">
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
					items={Object.fromEntries(
						Object.values(RewardReceivedBy).map((receivedBy) => [
							receivedBy,
							receivedBy === RewardReceivedBy.All
								? "Referrer & Redeemer"
								: keyToTitle(receivedBy),
						]),
					)}
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
				<ChipSelectTrigger
					chips={productIds.map((productId) => ({
						key: productId,
						label: getProductName(productId),
						onRemove: () => toggleProduct(productId),
					}))}
					placeholder="Select plans..."
				/>
				<DropdownMenuContent align="start" className="w-[var(--anchor-width)]">
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
