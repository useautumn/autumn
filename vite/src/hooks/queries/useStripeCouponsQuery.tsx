import { useQuery } from "@tanstack/react-query";
import type Stripe from "stripe";
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
		stripeCoupons: (data?.coupons || []) as Stripe.Coupon[],
		isLoading,
		error,
		refetch,
	};
};
