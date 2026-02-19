"use client";

import type {
	BillingAttachResponse,
	CheckResponse,
	Customer,
	OpenCustomerPortalResponse,
} from "@useautumn/sdk";
import { useCallback } from "react";
import type {
	AttachParams,
	CheckParams,
	OpenCustomerPortalParams,
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
		async (params: AttachParams): Promise<BillingAttachResponse> => {
			const response = await client
				.attach({
					...params,
					successUrl: window.location.href,
				})
				.then((response) => {
					return response;
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

	return {
		attach,
		check,
		openCustomerPortal,
	};
};

export type { AttachParams, CheckParams, OpenCustomerPortalParams };
