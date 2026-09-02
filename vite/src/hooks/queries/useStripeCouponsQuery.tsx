import { useQuery } from "@tanstack/react-query";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import type { StripeCouponWithPromoCodes } from "@/utils/product/couponUtils";

export const useStripeCouponsQuery = () => {
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();

	const { data, isLoading, error, refetch } = useQuery({
		queryKey: buildKey(["stripe_coupons"]),
		queryFn: () =>
			axiosInstance.get("/products/stripe_coupons").then((r) => r.data),
	});

	return {
		stripeCoupons: (data?.coupons || []) as StripeCouponWithPromoCodes[],
		isLoading,
		error,
		refetch,
	};
};
