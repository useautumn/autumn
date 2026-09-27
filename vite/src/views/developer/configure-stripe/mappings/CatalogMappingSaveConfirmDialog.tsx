import type { Reward } from "@autumn/shared";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	ShortcutButton,
} from "@autumn/ui";
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
	const rewardNames = visibleRewards.map((reward) => reward.name || reward.id);
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
	const { rewards } = useRewardsQuery();
	const affectedScopedRewards = getAffectedScopedRewards({
		rewards,
		affectedPriceIds,
	});

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Save mapping?</DialogTitle>
					<DialogDescription>
						New checkouts will use these Stripe products and prices. Existing
						customers and custom plans stay as they are.
					</DialogDescription>
				</DialogHeader>

				{affectedScopedRewards.length > 0 && (
					<InfoBox variant="warning">
						These coupons only apply to prices you're changing, so check them
						after saving: {formatRewardList(affectedScopedRewards)}.
					</InfoBox>
				)}

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
						Save
					</ShortcutButton>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
