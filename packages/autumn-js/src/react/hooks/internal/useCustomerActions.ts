"use client";

import type {
	AttachResponse,
	BillingUpdateResponse,
	CheckResponse,
	Customer,
	MultiAttachResponse,
	OpenCustomerPortalResponse,
	PreviewAttachResponse,
	PreviewMultiAttachResponse,
	PreviewUpdateResponse,
	SetupPaymentResponse,
} from "@useautumn/sdk";
import { useCallback } from "react";
import type {
	AttachParams,
	CheckParams,
	MultiAttachParams,
	OpenCustomerPortalParams,
	PreviewAttachParams,
	PreviewMultiAttachParams,
	PreviewUpdateSubscriptionParams,
	SetupPaymentParams,
	UpdateSubscriptionParams,
} from "../../../types";
import type { IAutumnClient } from "../../client/IAutumnClient";
import { getLocalCheckResponse } from "./getLocalCheckResponse";

const redirectToUrl = ({
	url,
	openInNewTab,
}: {
	url: string;
	openInNewTab?: boolean;
}) => {
	if (openInNewTab) {
		window.open(url, "_blank");
	} else {
		window.location.href = url;
	}
};

export const useCustomerActions = ({
	client,
	customer,
}: {
	client: IAutumnClient;
	customer: Customer | null;
}) => {
	const attach = useCallback(
		async (params: AttachParams): Promise<AttachResponse> => {
			const response = await client.attach({
				...params,
				successUrl: params.successUrl ?? window.location.href,
			});

			if (response.paymentUrl) {
				redirectToUrl({
					url: response.paymentUrl,
					openInNewTab: params.openInNewTab,
				});
			}
			return response;
		},
		[client],
	);

	const previewAttach = useCallback(
		async (params: PreviewAttachParams): Promise<PreviewAttachResponse> => {
			return client.previewAttach(params);
		},
		[client],
	);

	const updateSubscription = useCallback(
		async (
			params: UpdateSubscriptionParams,
		): Promise<BillingUpdateResponse> => {
			const response = await client.updateSubscription(params);

			if (response.paymentUrl) {
				redirectToUrl({
					url: response.paymentUrl,
					openInNewTab: params.openInNewTab,
				});
			}
			return response;
		},
		[client],
	);

	const previewUpdateSubscription = useCallback(
		async (
			params: PreviewUpdateSubscriptionParams,
		): Promise<PreviewUpdateResponse> => {
			return client.previewUpdateSubscription(params);
		},
		[client],
	);

	const check = useCallback(
		(params: CheckParams): CheckResponse => {
			return getLocalCheckResponse({
				customer,
				params,
			});
		},
		[customer],
	);

	const openCustomerPortal = useCallback(
		async (
			params: OpenCustomerPortalParams = {},
		): Promise<OpenCustomerPortalResponse> => {
			const response = await client.openCustomerPortal({
				...params,
				returnUrl: params.returnUrl ?? window.location.href,
			});

			redirectToUrl({
				url: response.url,
				openInNewTab: params.openInNewTab,
			});

			return response;
		},
		[client],
	);

	const multiAttach = useCallback(
		async (params: MultiAttachParams): Promise<MultiAttachResponse> => {
			const response = await client.multiAttach({
				...params,
				successUrl: params.successUrl ?? window.location.href,
			});

			if (response.paymentUrl) {
				redirectToUrl({
					url: response.paymentUrl,
					openInNewTab: params.openInNewTab,
				});
			}
			return response;
		},
		[client],
	);

	const previewMultiAttach = useCallback(
		async (
			params: PreviewMultiAttachParams,
		): Promise<PreviewMultiAttachResponse> => {
			return client.previewMultiAttach(params);
		},
		[client],
	);

	const setupPayment = useCallback(
		async (params: SetupPaymentParams = {}): Promise<SetupPaymentResponse> => {
			const response = await client.setupPayment({
				...params,
				successUrl: params.successUrl ?? window.location.href,
			});

			const redirectUrl = response.url;
			if (redirectUrl) {
				redirectToUrl({
					url: redirectUrl,
					openInNewTab: params.openInNewTab,
				});
			}

			return response;
		},
		[client],
	);

	return {
		attach,
		previewAttach,
		updateSubscription,
		previewUpdateSubscription,
		multiAttach,
		previewMultiAttach,
		check,
		openCustomerPortal,
		setupPayment,
	};
};

export type {
	AttachParams,
	CheckParams,
	MultiAttachParams,
	OpenCustomerPortalParams,
	PreviewAttachParams,
	PreviewMultiAttachParams,
	PreviewUpdateSubscriptionParams,
	SetupPaymentParams,
	UpdateSubscriptionParams,
};
