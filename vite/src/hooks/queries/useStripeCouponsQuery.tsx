import type { StripeCouponWithPromoCodes } from "@autumn/shared";
import { useQuery } from "@tanstack/react-query";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";

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
