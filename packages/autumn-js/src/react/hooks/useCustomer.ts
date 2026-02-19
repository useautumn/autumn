"use client";

import { useQuery } from "@tanstack/react-query";
import type {
	BillingAttachResponse,
	CheckResponse,
	Customer,
	OpenCustomerPortalResponse,
} from "@useautumn/sdk";
import type {
	AttachParams,
	CheckParams,
	GetOrCreateCustomerClientParams,
	OpenCustomerPortalParams,
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
		check: (params: UseCustomerCheckParams) => CheckResponse;

		/** Opens the Stripe customer billing portal for this customer and returns the portal session response. */
		openCustomerPortal: (
			params?: OpenCustomerPortalParams,
		) => Promise<OpenCustomerPortalResponse>;
	}
>;

/**
 * Fetches or creates an Autumn customer and provides billing actions.
 *
 * @returns Customer data along with `attach`, `check`, and `openCustomerPortal` methods for billing operations.
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
