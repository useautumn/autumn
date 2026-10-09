import { useQuery } from "@tanstack/react-query";
import type Stripe from "stripe";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";

/** The live Stripe subscription; Autumn's stored collection method can be stale. */
export const useStripeSubscriptionQuery = ({
	stripeSubscriptionId,
}: {
	stripeSubscriptionId: string | undefined;
}) => {
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();

	return useQuery({
		queryKey: buildKey([
			"customer",
			"stripe-subscription",
			stripeSubscriptionId,
		]),
		enabled: Boolean(stripeSubscriptionId),
		queryFn: async () => {
			const { data } = await axiosInstance.get<Stripe.Subscription>(
				`/v1/stripe_subscriptions/${stripeSubscriptionId}`,
			);
			return data;
		},
	});
};
