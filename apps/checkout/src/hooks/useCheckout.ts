import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { checkoutApi } from "@/api/checkoutClient";

export const checkoutKeys = {
	all: ["checkout"] as const,
	detail: (checkoutId: string) => [...checkoutKeys.all, checkoutId] as const,
};

export function useCheckout({ checkoutId }: { checkoutId: string }) {
	return useQuery({
		queryKey: checkoutKeys.detail(checkoutId),
		queryFn: () => checkoutApi.getCheckout({ checkout_id: checkoutId }),
		enabled: !!checkoutId,
	});
}

export function useConfirmCheckout({ checkoutId }: { checkoutId: string }) {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: () => checkoutApi.confirmCheckout({ checkout_id: checkoutId }),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: checkoutKeys.detail(checkoutId),
			});
		},
	});
}
