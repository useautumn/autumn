import type { StripeCouponWithPromoCodes } from "@autumn/shared";
import {
	SmallSpinner,
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@autumn/ui";
import { TicketIcon, XIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { toast } from "sonner";
import type Stripe from "stripe";
import { formatCouponDiscount } from "@/components/forms/attach-v2/utils/discountOptionUtils";
import { useStripeCouponsQuery } from "@/hooks/queries/useStripeCouponsQuery";
import { CusService } from "@/services/customers/CusService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { formatUnixToDate } from "@/utils/formatUtils/formatDateUtils";
import { getBackendErr } from "@/utils/genUtils";
import { getOriginalCouponId } from "@/utils/product/couponUtils";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { useCusReferralQuery } from "@/views/customers/customer/hooks/useCusReferralQuery";

const getAppliedCouponId = (
	discount: Stripe.Discount | null | undefined,
): string | null => {
	const coupon = discount?.source?.coupon;
	if (!coupon) return null;
	return typeof coupon === "string" ? coupon : coupon.id;
};

const formatCouponDuration = (coupon: Stripe.Coupon): string => {
	if (coupon.duration === "forever") return "Forever";
	if (coupon.duration === "repeating" && coupon.duration_in_months) {
		const months = coupon.duration_in_months;
		return `${months} month${months === 1 ? "" : "s"}`;
	}
	return "Once";
};

type CouponTooltipRow = { label: string; value: string };

const buildCouponTooltipRows = ({
	couponId,
	coupon,
	discount,
}: {
	couponId: string;
	coupon: StripeCouponWithPromoCodes | undefined;
	discount: Stripe.Discount;
}): CouponTooltipRow[] => {
	const rows: CouponTooltipRow[] = [];

	if (coupon?.name) rows.push({ label: "Name", value: coupon.name });
	rows.push({ label: "ID", value: couponId });

	if (coupon) {
		const discountText = formatCouponDiscount(coupon);
		if (discountText) rows.push({ label: "Discount", value: discountText });
		rows.push({ label: "Duration", value: formatCouponDuration(coupon) });
		if (coupon.promotion_codes.length > 0) {
			rows.push({
				label: coupon.promotion_codes.length === 1 ? "Code" : "Codes",
				value: coupon.promotion_codes.join(", "),
			});
		}
	}

	if (discount.end) {
		rows.push({
			label: "Ends",
			value: formatUnixToDate(discount.end * 1000),
		});
	}

	return rows;
};

export const AppliedCouponChip = ({ className }: { className?: string }) => {
	const { stripeCus, cusRewardRefetch } = useCusReferralQuery();
	const { customer, refetch } = useCusQuery();
	const axiosInstance = useAxiosInstance();
	const [removing, setRemoving] = useState(false);

	const discount = stripeCus?.discount as Stripe.Discount | null | undefined;
	const couponId = getAppliedCouponId(discount);

	// The customer's discount only carries the coupon id; the details come
	// from the org's coupon list, which is only fetched while a chip shows.
	const { stripeCoupons, isLoading: couponsLoading } = useStripeCouponsQuery({
		enabled: Boolean(couponId),
	});

	if (!discount || !couponId) return null;

	// Rollover coupons are per-customer copies named after the original.
	const originalCouponId = getOriginalCouponId(couponId);
	const coupon =
		stripeCoupons.find((candidate) => candidate.id === couponId) ??
		stripeCoupons.find((candidate) => candidate.id === originalCouponId);

	const handleRemoveClicked = async () => {
		try {
			setRemoving(true);
			await CusService.removeCouponFromCustomer({
				axios: axiosInstance,
				customer_id: customer.id,
			});
			await Promise.all([refetch(), cusRewardRefetch()]);
			toast.success("Reward removed from customer");
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to remove coupon"));
		} finally {
			setRemoving(false);
		}
	};

	const tooltipRows = buildCouponTooltipRows({ couponId, coupon, discount });

	return (
		<Tooltip delayDuration={0}>
			<TooltipTrigger asChild>
				<div className={className}>
					<TicketIcon size={13} className="shrink-0" />
					<span className="truncate">{couponId}</span>
					<button
						type="button"
						aria-label="Remove coupon"
						onClick={handleRemoveClicked}
						disabled={removing}
						className="shrink-0 opacity-60 hover:opacity-100 disabled:opacity-40 transition-opacity"
					>
						{removing ? <SmallSpinner size={11} /> : <XIcon size={11} />}
					</button>
				</div>
			</TooltipTrigger>
			<TooltipContent>
				<div className="flex flex-col gap-1.5 py-0.5">
					{tooltipRows.map((row) => (
						<div
							key={row.label}
							className="flex items-center justify-between gap-6"
						>
							<span className="text-tertiary-foreground">{row.label}</span>
							<span className="tabular-nums">{row.value}</span>
						</div>
					))}
					{couponsLoading && !coupon && (
						<span className="text-tertiary-foreground">Loading details…</span>
					)}
				</div>
			</TooltipContent>
		</Tooltip>
	);
};
