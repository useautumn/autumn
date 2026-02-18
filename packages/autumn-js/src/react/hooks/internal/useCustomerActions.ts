"use client";

import type {
	BalancesCheckResponse,
	BillingAttachResponse,
	Customer,
} from "@useautumn/sdk";
import { useCallback } from "react";
import type { AttachParams, CheckParams } from "../../../types";
import type { IAutumnClient } from "../../client/IAutumnClient";
import { getLocalCheckResponse } from "./checkUtils";

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
		(params: CheckParams): BalancesCheckResponse => {
			return getLocalCheckResponse({
				customer,
				params,
			});
		},
		[customer],
	);

	return {
		attach,
		check,
	};
};

export type { CheckParams, AttachParams };
