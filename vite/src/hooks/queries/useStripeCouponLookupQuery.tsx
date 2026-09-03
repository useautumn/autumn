import type { StripeCouponWithPromoCodes } from "@autumn/shared";
import { useQuery } from "@tanstack/react-query";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";

/**
 * Exact lookup of the coupon behind one promotion code. One indexed Stripe
 * call, so it scales to orgs with far more codes than the bulk listing loads.
 */
export const useStripeCouponLookupQuery = ({
	code,
	enabled = true,
}: {
	code: string;
	enabled?: boolean;
}) => {
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();

	const { data, isFetching } = useQuery({
		queryKey: buildKey(["stripe_coupons", "lookup", code]),
		queryFn: () =>
			axiosInstance
				.get("/products/stripe_coupons", { params: { code } })
				.then((r) => r.data),
		enabled: enabled && code.length > 0,
	});

	const coupon = (data?.coupons?.[0] ??
		null) as StripeCouponWithPromoCodes | null;

	return { coupon, isFetching };
};
