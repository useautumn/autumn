import type { ListReferralProgramsResponse } from "../../../../../../shared/api/referralPrograms/referralProgramsListOpModels.js";
import type { ApiRewardsListV0 } from "../../../../../../shared/api/rewards/rewardsListOpModels.js";
import { request } from "../client.js";

export const fetchRewards = ({ secretKey }: { secretKey: string }) =>
	request<ApiRewardsListV0>({
		method: "POST",
		path: "/v1/rewards.list",
		secretKey,
		body: {},
		headers: { "X-API-Version": "2.2.0" },
	});

export const fetchReferralPrograms = ({ secretKey }: { secretKey: string }) =>
	request<ListReferralProgramsResponse>({
		method: "POST",
		path: "/v1/referral_programs.list",
		secretKey,
		body: {},
		headers: { "X-API-Version": "2.2.0" },
	});
