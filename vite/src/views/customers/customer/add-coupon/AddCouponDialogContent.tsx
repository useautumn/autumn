import { type Reward, RewardType } from "@autumn/shared";
import { useState } from "react";
import { toast } from "sonner";
import { WarningBox } from "@/components/general/modal-components/WarningBox";
import { Button } from "@/components/ui/button";
import {
	DialogContent,
	DialogFooter,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { CusService } from "@/services/customers/CusService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useEnv } from "@/utils/envUtils";
import { getBackendErr } from "@/utils/genUtils";
import { getOriginalCouponId } from "@/utils/product/couponUtils";
import { useCustomerContext } from "../CustomerContext";

const AddCouponDialogContent = ({
	setOpen,
}: {
	setOpen: (open: boolean) => void;
}) => {
	const { cusMutate, customer, coupons, discount } = useCustomerContext();
	const [couponSelected, setCouponSelected] = useState<Reward | null>(null);
	const [loading, setLoading] = useState(false);
	const env = useEnv();
	const axiosInstance = useAxiosInstance({ env });

	const handleAddClicked = async () => {
		try {
			setLoading(true);
			await CusService.addCouponToCustomer({
				axios: axiosInstance,
				customer_id: customer.id,
				coupon_id: couponSelected?.internal_id,
			});
			setOpen(false);
			await cusMutate();
			toast.success("Reward added to customer");
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to create coupon"));
		} finally {
			setLoading(false);
		}
	};

	const _existingDiscount = discount;

	const getExistingCoupon = () => {
		if (discount) {
			return coupons.find(
				(c: Reward) => c.id === getOriginalCouponId(discount.coupon.id),
			);
		} else {
			return null;
		}
	};

	return (
		<DialogContent className="min-w-sm max-w-md">
			<DialogTitle>Add Reward</DialogTitle>
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
						const coupon = coupons.find((c: Reward) => c.internal_id === value);
						if (coupon) {
							setCouponSelected(coupon);
						}
					}}
				>
					<SelectTrigger>
						<SelectValue placeholder="Select Reward" />
					</SelectTrigger>
					<SelectContent>
						{/* If empty */}

						{coupons && coupons.length > 0 ? (
							coupons.map((coupon: Reward) => {
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
					variant="gradientPrimary"
					onClick={() => handleAddClicked()}
					disabled={!couponSelected}
					isLoading={loading}
				>
					Add Reward
				</Button>
			</DialogFooter>
		</DialogContent>
	);
};

export default AddCouponDialogContent;
