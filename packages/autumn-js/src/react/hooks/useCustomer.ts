"use client";

import { useQuery } from "@tanstack/react-query";
import type {
	BalancesCheckResponse,
	BillingAttachResponse,
	Customer,
} from "@useautumn/sdk";
import type {
	AttachParams,
	CheckParams,
	GetOrCreateCustomerClientParams,
} from "../../types";
import { useAutumnClient } from "../AutumnContext";
import type { AutumnClientError } from "../client/AutumnClientError";
import { useCustomerActions } from "./internal/useCustomerActions";
import type { HookParams, HookResultWithMethods } from "./types";

export type UseCustomerParams = HookParams<
	GetOrCreateCustomerClientParams,
	Customer | null
>;

export type UseCustomerCheckParams = CheckParams;

export type UseCustomerResult = HookResultWithMethods<
	Customer | null,
	{
		/** The customer object. */
		data?: Customer;

		/** Attaches a plan to the customer. Handles new subscriptions, upgrades and downgrades. */
		attach: (params: AttachParams) => Promise<BillingAttachResponse>;

		/** Checks feature access and balance for the customer locally (no API call). */
		check: (params: UseCustomerCheckParams) => BalancesCheckResponse;
	}
>;

/**
 * Fetches or creates an Autumn customer and provides billing actions.
 *
 * @returns Customer data along with `attach` and `check` methods for billing operations.
 */
export const useCustomer = (
	params: UseCustomerParams = {},
): UseCustomerResult => {
	const client = useAutumnClient();
	const { errorOnNotFound, queryOptions, ...sdkParams } = params;

	const queryResult = useQuery<Customer | null, AutumnClientError>({
		queryKey: ["autumn", "customer", sdkParams],
		queryFn: () =>
			client.getOrCreateCustomer({
				...sdkParams,
				...(errorOnNotFound !== undefined && { errorOnNotFound }),
			}),
		...queryOptions,
	});

	const actions = useCustomerActions({
		client,
		customer: queryResult.data ?? null,
	});

	return {
		...queryResult,
		...actions,
	} as UseCustomerResult;
};
