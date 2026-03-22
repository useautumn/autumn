import { useQuery } from "@tanstack/react-query";
import type Stripe from "stripe";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useOrg } from "../common/useOrg";

/** Fetches organization Stripe account information */
export const useOrgStripeQuery = () => {
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();
	const { org } = useOrg();

	const fetchStripeAccount = async () => {
		const { data } = await axiosInstance.get<Stripe.Account>(
			"/v1/organization/stripe",
		);
		return data;
	};

	const { data, isLoading, error, refetch } = useQuery<Stripe.Account | null>({
		queryKey: buildKey(["org", org?.id, "stripe"]),
		queryFn: fetchStripeAccount,
		retry: false,
		enabled: !!org?.id,
	});

	return {
		stripeAccount: data || null,
		isLoading,
		error,
		refetch,
	};
};
