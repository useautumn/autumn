import type { Reward } from "@autumn/shared";
import { RewardType } from "@autumn/shared";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
	ShortcutButton,
} from "@autumn/ui";
import { useState } from "react";
import { toast } from "sonner";
import {
	rewardToOption,
	stripeCouponToOption,
} from "@/components/forms/attach-v2/utils/discountOptionUtils";
import { useRewardsQuery } from "@/hooks/queries/useRewardsQuery";
import { useStripeCouponsQuery } from "@/hooks/queries/useStripeCouponsQuery";
import { CusService } from "@/services/customers/CusService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import { getOriginalCouponId } from "@/utils/product/couponUtils";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { useCusReferralQuery } from "@/views/customers/customer/hooks/useCusReferralQuery";
import { InfoBox } from "@/views/onboarding2/integrate/components/InfoBox";

export const AddCouponDialog = ({
	open,
	setOpen,
}: {
	open: boolean;
	setOpen: (open: boolean) => void;
}) => {
	const { stripeCus, cusRewardRefetch } = useCusReferralQuery();
	const { customer, refetch } = useCusQuery();

	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [promoCodeSelected, setPromoCodeSelected] = useState<string | null>(
		null,
	);
	const [loading, setLoading] = useState(false);
	const axiosInstance = useAxiosInstance();

	const { rewards } = useRewardsQuery();
	const { stripeCoupons } = useStripeCouponsQuery();

	// Stripe coupons are merged in so coupons created outside Autumn are
	// selectable here, matching the subscription-level discount picker.
	const rewardOptions = rewards
		.filter((reward: Reward) => reward.type !== RewardType.FreeProduct)
		.map(rewardToOption);

	const rewardOptionIds = new Set(rewardOptions.map((option) => option.id));
	const stripeOnlyOptions = stripeCoupons
		.filter((coupon) => !rewardOptionIds.has(coupon.id))
		.map(stripeCouponToOption);

	const discountOptions = [...rewardOptions, ...stripeOnlyOptions];

	const selectedReward = rewards.find((r: Reward) => r.id === selectedId);
	const requiresPromoCode = selectedReward?.type === RewardType.FeatureGrant;

	const resetSelection = () => {
		setSelectedId(null);
		setPromoCodeSelected(null);
	};

	const handleDialogOpenChange = (nextOpen: boolean) => {
		if (!nextOpen) {
			resetSelection();
		}

		setOpen(nextOpen);
	};

	const handleAddClicked = async () => {
		if (!selectedId) return;
		if (requiresPromoCode && !promoCodeSelected) return;

		try {
			setLoading(true);
			await CusService.addCouponToCustomer({
				axios: axiosInstance,
				customer_id: customer.id,
				coupon_id: selectedId,
				promo_code: promoCodeSelected ?? undefined,
			});
			setOpen(false);
			await Promise.all([refetch(), cusRewardRefetch()]);
			toast.success("Reward added to customer");
			resetSelection();
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to create coupon"));
		} finally {
			setLoading(false);
		}
	};

	const existingDiscount = stripeCus?.discount;

	const getExistingCoupon = () => {
		if (existingDiscount?.coupon?.id) {
			const originalId = getOriginalCouponId(existingDiscount.coupon.id);
			return discountOptions.find(
				(option) => option.id === originalId || option.label === originalId,
			);
		}
		return null;
	};

	const promoCodeOptions = (selectedReward?.promo_codes || []).filter(
		(promoCode) => promoCode.code,
	);

	return (
		<Dialog open={open} onOpenChange={handleDialogOpenChange}>
			<DialogContent className="w-[400px] bg-card">
				<DialogHeader>
					<DialogTitle>Add Reward</DialogTitle>
					<DialogDescription>
						Apply a reward or coupon to this customer.
					</DialogDescription>
				</DialogHeader>
				{getExistingCoupon() && (
					<InfoBox variant="warning">
						Reward {getExistingCoupon()?.name} already applied. Adding a new one
						will replace the existing one.
					</InfoBox>
				)}
				<div className="space-y-3">
					<Select
						value={selectedId ?? undefined}
						onValueChange={(value) => {
							setSelectedId(value);
							setPromoCodeSelected(null);
						}}
						items={Object.fromEntries(
							discountOptions.map((option) => [option.id, option.label]),
						)}
					>
						<SelectTrigger className="w-full">
							<SelectValue placeholder="Select Reward" />
						</SelectTrigger>
						<SelectContent>
							{discountOptions.length > 0 ? (
								discountOptions.map((option) => (
									<SelectItem key={option.id} value={option.id}>
										{option.label}
									</SelectItem>
								))
							) : (
								<SelectItem value="none" disabled>
									No coupons found
								</SelectItem>
							)}
						</SelectContent>
					</Select>

					{requiresPromoCode && (
						<Select
							value={promoCodeSelected || undefined}
							onValueChange={setPromoCodeSelected}
							items={Object.fromEntries(
								promoCodeOptions.map((promoCode) => [
									promoCode.code,
									promoCode.code,
								]),
							)}
						>
							<SelectTrigger className="w-full">
								<SelectValue placeholder="Select Promo Code" />
							</SelectTrigger>
							<SelectContent>
								{promoCodeOptions.length > 0 ? (
									promoCodeOptions.map((promoCode) => (
										<SelectItem key={promoCode.code} value={promoCode.code}>
											{promoCode.code}
										</SelectItem>
									))
								) : (
									<SelectItem value="none" disabled>
										No promo codes found
									</SelectItem>
								)}
							</SelectContent>
						</Select>
					)}
				</div>
				<DialogFooter>
					<ShortcutButton
						variant="primary"
						onClick={handleAddClicked}
						disabled={!selectedId || (requiresPromoCode && !promoCodeSelected)}
						isLoading={loading}
						metaShortcut="enter"
						className="w-full"
					>
						Add Reward
					</ShortcutButton>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
