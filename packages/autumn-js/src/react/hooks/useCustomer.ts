"use client";

import { useQuery } from "@tanstack/react-query";
import type {
	BillingAttachResponse,
	BillingUpdateResponse,
	CheckResponse,
	Customer,
	OpenCustomerPortalResponse,
	PreviewAttachResponse,
	PreviewUpdateResponse,
} from "@useautumn/sdk";
import type {
	AttachParams,
	CheckParams,
	GetOrCreateCustomerClientParams,
	OpenCustomerPortalParams,
	PreviewAttachParams,
	PreviewUpdateSubscriptionParams,
	UpdateSubscriptionParams,
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

		/**
		 * Attaches a plan to the customer. Handles new subscriptions, upgrades and downgrades.
		 * Automatically redirects to checkout if payment is required.
		 * @param params - Plan ID and optional configuration (free trial, custom pricing, discounts).
		 * @returns Billing response with customer ID, invoice details, and payment URL if checkout required.
		 */
		attach: (params: AttachParams) => Promise<BillingAttachResponse>;

		/**
		 * Previews the billing changes that would occur when attaching a plan, without making any changes.
		 * Use this to show customers what they will be charged before confirming a subscription change.
		 * @param params - Plan ID and optional configuration to preview.
		 * @returns Preview with line items, totals, and effective dates for the proposed changes.
		 */
		previewAttach: (
			params: PreviewAttachParams,
		) => Promise<PreviewAttachResponse>;

		/**
		 * Updates an existing subscription. Use to modify feature quantities, cancel, or change plan configuration.
		 * Automatically redirects to checkout if payment is required.
		 * @param params - Plan ID, feature quantities, and optional cancel action.
		 * @returns Billing response with customer ID, invoice details, and payment URL if next action required.
		 */
		updateSubscription: (
			params: UpdateSubscriptionParams,
		) => Promise<BillingUpdateResponse>;

		/**
		 * Previews the billing changes that would occur when updating a subscription, without making any changes.
		 * Use this to show customers prorated charges or refunds before confirming subscription modifications.
		 * @param params - Plan ID, feature quantities, and optional cancel action to preview.
		 * @returns Preview with line items showing prorated charges or credits for the proposed changes.
		 */
		previewUpdateSubscription: (
			params: PreviewUpdateSubscriptionParams,
		) => Promise<PreviewUpdateResponse>;

		/**
		 * Checks feature access and balance for the customer locally (no API call).
		 * @param params - Feature ID to check access for.
		 * @returns Check response with access status and remaining balance.
		 */
		check: (params: UseCustomerCheckParams) => CheckResponse;

		/**
		 * Opens the Stripe customer billing portal for this customer.
		 * @param params - Optional return URL and configuration.
		 * @returns Portal session response with URL to redirect the customer.
		 */
		openCustomerPortal: (
			params?: OpenCustomerPortalParams,
		) => Promise<OpenCustomerPortalResponse>;
	}
>;

/**
 * Fetches or creates an Autumn customer and provides billing actions.
 *
 * @returns Customer data along with billing methods: `attach`, `previewAttach`, `updateSubscription`, `previewUpdateSubscription`, `check`, and `openCustomerPortal`.
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
