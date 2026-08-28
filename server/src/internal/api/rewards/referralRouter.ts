import { Hono } from "hono";
import type { HonoEnv } from "../../../honoUtils/HonoEnv.js";
import { handleRedeemReward } from "./handlers/handleRedeemReward.js";
import {
	handleCreateReferralProgram,
	handleDeleteReferralProgram,
	handleGetReferralProgram,
	handleListReferralPrograms,
	handleUpdateReferralProgram,
} from "./handlers/referralPrograms/index.js";
import { handleGetRedemption } from "./handlers/referrals/handleGetRedemption.js";
import { handleGetReferralCode } from "./handlers/referrals/handleGetReferralCode.js";
import { handleRedeemReferral } from "./handlers/referrals/handleRedeemReferral.js";
import {
	handleDeleteReward,
	handleGetReward,
	handleUpdateReward,
} from "./handlers/rewards/apiRewardHandlers.js";
import {
	handleCreateReward,
	handleListRewards,
} from "./handlers/rewards/index.js";

export const redemptionRouter = new Hono<HonoEnv>();

redemptionRouter.get("/:redemption_id", ...handleGetRedemption);

export const referralRouter = new Hono<HonoEnv>();
referralRouter.post("/code", ...handleGetReferralCode);
referralRouter.post("/redeem", ...handleRedeemReferral);

export const referralRpcRouter = new Hono<HonoEnv>();
referralRpcRouter.post("/referrals.create_code", ...handleGetReferralCode);
referralRpcRouter.post("/referrals.redeem_code", ...handleRedeemReferral);
referralRpcRouter.post(
	"/referral_programs.create",
	...handleCreateReferralProgram,
);
referralRpcRouter.post(
	"/referral_programs.list",
	...handleListReferralPrograms,
);
referralRpcRouter.post("/referral_programs.get", ...handleGetReferralProgram);
referralRpcRouter.post(
	"/referral_programs.update",
	...handleUpdateReferralProgram,
);
referralRpcRouter.post(
	"/referral_programs.delete",
	...handleDeleteReferralProgram,
);
referralRpcRouter.post("/rewards.redeem", ...handleRedeemReward);
referralRpcRouter.post("/rewards.list", ...handleListRewards);
referralRpcRouter.post("/rewards.create", ...handleCreateReward);
referralRpcRouter.post("/rewards.get", ...handleGetReward);
referralRpcRouter.post("/rewards.update", ...handleUpdateReward);
referralRpcRouter.post("/rewards.delete", ...handleDeleteReward);
