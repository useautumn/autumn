import type { Autumn } from "@sdk";
import type * as operations from "@useautumn/sdk/models/operations";
import { addRoute, type RouterContext } from "rou3";
import { BASE_PATH } from "../constants";
import { withAuth } from "../utils/withAuth";

const createReferralCodeHandler = withAuth({
	fn: async ({
		autumn,
		customerId,
		body,
	}: {
		autumn: Autumn;
		customerId: string;
		body: Omit<operations.PostReferralsCodeRequestBody, "customerId">;
	}) => {
		return await autumn.referrals.postReferralsCode({
			body: {
				...body,
				customerId: customerId,
			},
		});
	},
});

const redeemReferralCodeHandler = withAuth({
	fn: async ({
		autumn,
		customerId,
		body,
	}: {
		autumn: Autumn;
		customerId: string;
		body: Omit<operations.PostReferralsRedeemRequestBody, "customerId">;
	}) => {
		return await autumn.referrals.postReferralsRedeem({
			body: {
				...body,
				customerId: customerId,
			},
		});
	},
});

export const addReferralRoutes = async (router: RouterContext) => {
	addRoute(router, "POST", `${BASE_PATH}/referrals/code`, {
		handler: createReferralCodeHandler,
	});

	addRoute(router, "POST", `${BASE_PATH}/referrals/redeem`, {
		handler: redeemReferralCodeHandler,
	});
};
