import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	ShortcutButton,
} from "@autumn/ui";
import type { Reward } from "@autumn/shared";
import { useRewardsQuery } from "@/hooks/queries/useRewardsQuery";
import { InfoBox } from "@/views/onboarding2/integrate/components/InfoBox";

const getAffectedScopedRewards = ({
	rewards,
	affectedPriceIds,
}: {
	rewards: Reward[];
	affectedPriceIds: string[];
}) => {
	if (affectedPriceIds.length === 0) return [];

	const affectedPriceIdSet = new Set(affectedPriceIds);
	return rewards.filter((reward) => {
		const discountConfig = reward.discount_config;
		if (!discountConfig || discountConfig.apply_to_all) return false;
		return (discountConfig.price_ids ?? []).some((priceId) =>
			affectedPriceIdSet.has(priceId),
		);
	});
};

const formatRewardList = (rewards: Reward[]) => {
	const visibleRewards = rewards.slice(0, 3);
	const rewardNames = visibleRewards.map(
		(reward) => reward.name || reward.id,
	);
	const remainingCount = rewards.length - visibleRewards.length;

	return remainingCount > 0
		? `${rewardNames.join(", ")} +${remainingCount} more`
		: rewardNames.join(", ");
};

export const CatalogMappingSaveConfirmDialog = ({
	open,
	isSaving,
	affectedPriceIds,
	onOpenChange,
	onConfirm,
}: {
	open: boolean;
	isSaving: boolean;
	affectedPriceIds: string[];
	onOpenChange: (open: boolean) => void;
	onConfirm: () => void;
}) => {
	const { rewards, isLoading } = useRewardsQuery();
	const affectedScopedRewards = getAffectedScopedRewards({
		rewards,
		affectedPriceIds,
	});
	const rewardWarning =
		affectedScopedRewards.length > 0
			? ` Scoped rewards may need review: ${formatRewardList(
					affectedScopedRewards,
				)}.`
			: "";
	const loadingWarning =
		isLoading && affectedPriceIds.length > 0 ? " Checking scoped rewards." : "";

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Save Stripe product mappings?</DialogTitle>
					<DialogDescription>
						Confirm these mappings before Autumn updates the catalog state.
					</DialogDescription>
				</DialogHeader>

				<InfoBox variant="warning">
					Saving updates all base and variant versions. Existing customers' Stripe
					state is unchanged; new Stripe products are used only going forward.
					Prices on custom plans are not affected.
					{loadingWarning}
					{rewardWarning}
				</InfoBox>

				<DialogFooter>
					<ShortcutButton
						disabled={isSaving}
						onClick={() => onOpenChange(false)}
						singleShortcut="escape"
						variant="secondary"
					>
						Cancel
					</ShortcutButton>
					<ShortcutButton
						disabled={isSaving}
						isLoading={isSaving}
						metaShortcut="enter"
						onClick={onConfirm}
					>
						Save mappings
					</ShortcutButton>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
