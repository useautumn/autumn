"use client";

import { useQuery } from "@tanstack/react-query";
import type {
	CreateReferralCodeResponse,
	RedeemReferralCodeResponse,
} from "@useautumn/sdk";
import { useCallback } from "react";
import type {
	CreateReferralCodeParams,
	RedeemReferralCodeParams,
} from "../../types";
import { useAutumnClient } from "../AutumnContext";
import type { AutumnClientError } from "../client/AutumnClientError";
import type { HookParams, HookResultWithMethods } from "./types";

export type UseReferralsParams = HookParams<
	CreateReferralCodeParams,
	CreateReferralCodeResponse
>;

export type UseReferralsResult = HookResultWithMethods<
	CreateReferralCodeResponse,
	{
		/** Redeems a referral code for the current customer. */
		redeemCode: (
			params: RedeemReferralCodeParams,
		) => Promise<RedeemReferralCodeResponse>;
	}
>;

/**
 * Referral helper hook.
 *
 * - `data` is the latest create-code response.
 * - Access the code as `data?.code`.
 * - Call `refetch()` to create/fetch the code for `programId`.
 */
export const useReferrals = (
	params: UseReferralsParams,
): UseReferralsResult => {
	const client = useAutumnClient({ caller: "useReferrals" });
	const { programId, queryOptions } = params;

	const queryResult = useQuery<CreateReferralCodeResponse, AutumnClientError>({
		queryKey: ["autumn", "referrals", "create", programId],
		queryFn: () =>
			client.createReferralCode({
				programId,
			}),
		enabled: false,
		...queryOptions,
	});

	const redeemCode = useCallback(
		async (
			redeemParams: RedeemReferralCodeParams,
		): Promise<RedeemReferralCodeResponse> => {
			return client.redeemReferralCode(redeemParams);
		},
		[client],
	);

	return {
		...queryResult,
		redeemCode,
	};
};
