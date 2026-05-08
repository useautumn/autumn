import type { ApiDiscount } from "@autumn/shared";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { useParams } from "react-router";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";

export const useCusRewardsQuery = ({
	enabled = true,
}: {
	enabled?: boolean;
} = {}) => {
	const { customer_id } = useParams();
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();

	const fetcher = async () => {
		if (!customer_id) return { customer: { rewards: { discounts: [] } } };

		const { data } = await axiosInstance.get(
			`/customers/${customer_id}?expand=rewards`,
		);
		return data;
	};

	const { data, isLoading, error, refetch } = useQuery({
		queryKey: buildKey(["customer-rewards", customer_id]),
		queryFn: fetcher,
		enabled: enabled && !!customer_id,
		staleTime: 5 * 60 * 1000,
	});

	const discounts: ApiDiscount[] = useMemo(
		() => data?.customer?.rewards?.discounts ?? [],
		[data],
	);

	const getDiscountsForSubscription = useCallback(
		({ subscriptionIds }: { subscriptionIds: string[] }) => {
			if (subscriptionIds.length === 0) return [];
			return discounts.filter(
				(discount) =>
					discount.subscription_id &&
					subscriptionIds.includes(discount.subscription_id),
			);
		},
		[discounts],
	);

	return {
		discounts,
		getDiscountsForSubscription,
		isLoading,
		error,
		refetch,
	};
};
