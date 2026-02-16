import type {
	RedeemReferralCodeResponse,
	ReferralCode,
} from "@useautumn/sdk/models";
import type {
	ReferralCreateCodeParams,
	ReferralRedeemCodeParams,
} from "./autumnTypes";
import type { AutumnClient } from "./ReactAutumnClient";

export async function createCode(
	this: AutumnClient,
	params: ReferralCreateCodeParams,
): Promise<ReferralCode> {
	const res = await this.post(`${this.prefix}/referrals/code`, params);
	return res;
}

export async function redeemCode(
	this: AutumnClient,
	params: ReferralRedeemCodeParams,
): Promise<RedeemReferralCodeResponse> {
	const res = await this.post(`${this.prefix}/referrals/redeem`, params);
	return res;
}
