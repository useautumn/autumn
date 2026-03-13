import {
	CheckoutErrorCode,
	type ConfirmCheckoutParams,
	type GetCheckoutResponse,
} from "@autumn/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { checkoutApi } from "@/api/checkoutClient";
import { getCheckoutApiErrorCode } from "@/utils/checkoutApiErrorUtils";

export const checkoutKeys = {
	all: ["checkout"] as const,
	detail: (checkoutId: string) => [...checkoutKeys.all, checkoutId] as const,
};

const shouldRetryCheckoutQuery = ({
	error,
	failureCount,
}: {
	error: unknown;
	failureCount: number;
}) => {
	const errorCode = getCheckoutApiErrorCode({ error });

	if (
		errorCode === CheckoutErrorCode.CheckoutCompleted ||
		errorCode === CheckoutErrorCode.CheckoutExpired ||
		errorCode === CheckoutErrorCode.CheckoutUnavailable
	) {
		return false;
	}

	return failureCount < 1;
};

export function useCheckout({ checkoutId }: { checkoutId: string }) {
	return useQuery<GetCheckoutResponse>({
		queryKey: checkoutKeys.detail(checkoutId),
		queryFn: () => checkoutApi.getCheckout({ checkout_id: checkoutId }),
		enabled: !!checkoutId,
		retry: (failureCount, error) =>
			shouldRetryCheckoutQuery({ error, failureCount }),
	});
}

export function usePreviewCheckout({ checkoutId }: { checkoutId: string }) {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (body: ConfirmCheckoutParams) =>
			checkoutApi.previewCheckout({ checkout_id: checkoutId, ...body }),
		onSuccess: (data) => {
			// Update the checkout query cache with new preview data
			queryClient.setQueryData(
				checkoutKeys.detail(checkoutId),
				data as GetCheckoutResponse,
			);
		},
	});
}

export function useConfirmCheckout({ checkoutId }: { checkoutId: string }) {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (body: ConfirmCheckoutParams) =>
			checkoutApi.confirmCheckout({ checkout_id: checkoutId, ...body }),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: checkoutKeys.detail(checkoutId),
			});
		},
	});
}
