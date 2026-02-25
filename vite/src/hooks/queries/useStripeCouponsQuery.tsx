import { useQuery } from "@tanstack/react-query";
import type Stripe from "stripe";
import { useAxiosInstance } from "@/services/useAxiosInstance";

export const useStripeCouponsQuery = () => {
	const axiosInstance = useAxiosInstance();

	const { data, isLoading, error, refetch } = useQuery({
		queryKey: ["stripe_coupons"],
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
