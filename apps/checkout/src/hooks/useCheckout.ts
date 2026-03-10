import {
	CheckoutErrorCode,
	type ConfirmCheckoutParams,
	type GetCheckoutResponse,
} from "@autumn/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { checkoutApi } from "@/api/checkoutClient";

export const checkoutKeys = {
	all: ["checkout"] as const,
	detail: (checkoutId: string) => [...checkoutKeys.all, checkoutId] as const,
};

const getORPCErrorBody = ({ error }: { error: unknown }) => {
	if (
		error &&
		typeof error === "object" &&
		"data" in error &&
		error.data &&
		typeof error.data === "object" &&
		"body" in error.data &&
		error.data.body &&
		typeof error.data.body === "object"
	) {
		return error.data.body;
	}

	return undefined;
};

const getCheckoutErrorCode = ({ error }: { error: unknown }) => {
	if (!error || typeof error !== "object") return undefined;

	const orpcBody = getORPCErrorBody({ error });

	if (
		orpcBody &&
		"code" in orpcBody &&
		typeof orpcBody.code === "string"
	) {
		return orpcBody.code;
	}

	if ("code" in error && typeof error.code === "string") {
		return error.code;
	}

	if (
		"data" in error &&
		error.data &&
		typeof error.data === "object" &&
		"code" in error.data &&
		typeof error.data.code === "string"
	) {
		return error.data.code;
	}

	if (
		"response" in error &&
		error.response &&
		typeof error.response === "object" &&
		"data" in error.response &&
		error.response.data &&
		typeof error.response.data === "object" &&
		"code" in error.response.data &&
		typeof error.response.data.code === "string"
	) {
		return error.response.data.code;
	}

	return undefined;
};

const shouldRetryCheckoutQuery = ({
	error,
	failureCount,
}: {
	error: unknown;
	failureCount: number;
}) => {
	const errorCode = getCheckoutErrorCode({ error });

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
