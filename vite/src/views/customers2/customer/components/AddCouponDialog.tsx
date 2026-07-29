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
import { useRewardsQuery } from "@/hooks/queries/useRewardsQuery";
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

	const [couponSelected, setCouponSelected] = useState<Reward | null>(null);
	const [promoCodeSelected, setPromoCodeSelected] = useState<string | null>(
		null,
	);
	const [loading, setLoading] = useState(false);
	const axiosInstance = useAxiosInstance();

	const { rewards } = useRewardsQuery();

	const resetSelection = () => {
		setCouponSelected(null);
		setPromoCodeSelected(null);
	};

	const handleDialogOpenChange = (nextOpen: boolean) => {
		if (!nextOpen) {
			resetSelection();
		}

		setOpen(nextOpen);
	};

	const handleAddClicked = async () => {
		if (!couponSelected) return;
		if (couponSelected.type === RewardType.FeatureGrant && !promoCodeSelected)
			return;

		try {
			setLoading(true);
			await CusService.addCouponToCustomer({
				axios: axiosInstance,
				customer_id: customer.id,
				coupon_id: couponSelected.internal_id,
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
			return rewards.find(
				(c: Reward) =>
					c?.internal_id === getOriginalCouponId(existingDiscount.coupon.id),
			);
		}
		return null;
	};

	if (!rewards) return null;

	const promoCodeOptions = (couponSelected?.promo_codes || []).filter(
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
						value={couponSelected?.internal_id}
						onValueChange={(value) => {
							const coupon = rewards.find(
								(c: Reward) => c.internal_id === value,
							);

							if (!coupon) return;

							setCouponSelected(coupon);
							setPromoCodeSelected(null);
						}}
						items={Object.fromEntries(
							rewards
								.filter((c: Reward) => c.type !== RewardType.FreeProduct)
								.map((c: Reward) => [c.internal_id, c.name]),
						)}
					>
						<SelectTrigger className="w-full">
							<SelectValue placeholder="Select Reward" />
						</SelectTrigger>
						<SelectContent>
							{rewards && rewards.length > 0 ? (
								rewards.map((coupon: Reward) => {
									if (coupon.type === RewardType.FreeProduct) return null;
									return (
										<SelectItem
											key={coupon.internal_id}
											value={coupon.internal_id}
										>
											{coupon.name}
										</SelectItem>
									);
								})
							) : (
								<SelectItem value="none" disabled>
									No coupons found
								</SelectItem>
							)}
						</SelectContent>
					</Select>

					{couponSelected?.type === RewardType.FeatureGrant && (
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
						disabled={
							!couponSelected ||
							(couponSelected.type === RewardType.FeatureGrant &&
								!promoCodeSelected)
						}
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
