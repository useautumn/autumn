import type { Reward } from "@autumn/shared";
import { RewardType } from "@autumn/shared";
import { useState } from "react";
import { toast } from "sonner";
import { WarningBox } from "@/components/general/modal-components/WarningBox";
import { Button } from "@/components/v2/buttons/Button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/v2/dialogs/Dialog";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/v2/selects/Select";
import { useRewardsQuery } from "@/hooks/queries/useRewardsQuery";
import { CusService } from "@/services/customers/CusService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import { getOriginalCouponId } from "@/utils/product/couponUtils";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { useCusReferralQuery } from "@/views/customers/customer/hooks/useCusReferralQuery";

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
	const [loading, setLoading] = useState(false);
	const axiosInstance = useAxiosInstance();

	const { rewards } = useRewardsQuery();

	const handleAddClicked = async () => {
		if (!couponSelected) return;

		try {
			setLoading(true);
			await CusService.addCouponToCustomer({
				axios: axiosInstance,
				customer_id: customer.id,
				coupon_id: couponSelected.internal_id,
			});
			setOpen(false);
			await Promise.all([refetch(), cusRewardRefetch()]);
			toast.success("Reward added to customer");
			// Reset selection after success
			setCouponSelected(null);
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

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogContent className="w-[400px] bg-card">
				<DialogHeader>
					<DialogTitle>Add Reward</DialogTitle>
				</DialogHeader>
				{getExistingCoupon() && (
					<WarningBox>
						Reward {getExistingCoupon()?.name} already applied. Adding a new one
						will replace the existing one.
					</WarningBox>
				)}
				<div>
					<Select
						value={couponSelected?.internal_id}
						onValueChange={(value) => {
							const coupon = rewards.find(
								(c: Reward) => c.internal_id === value,
							);
							if (coupon) {
								setCouponSelected(coupon);
							}
						}}
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
				</div>
				<DialogFooter>
					<Button
						variant="primary"
						onClick={handleAddClicked}
						disabled={!couponSelected}
						isLoading={loading}
					>
						Add Reward
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
