import { Hono } from "hono";
import type { HonoEnv } from "../../../honoUtils/HonoEnv.js";
import { handleGetRedemption } from "./handlers/referrals/handleGetRedemption.js";
import { handleGetReferralCode } from "./handlers/referrals/handleGetReferralCode.js";
import { handleRedeemReferral } from "./handlers/referrals/handleRedeemReferral.js";

export const redemptionRouter = new Hono<HonoEnv>();

redemptionRouter.get("/:redemption_id", ...handleGetRedemption);

export const referralRouter = new Hono<HonoEnv>();
referralRouter.post("/code", ...handleGetReferralCode);
referralRouter.post("/redeem", ...handleRedeemReferral);

export const referralRpcRouter = new Hono<HonoEnv>();
referralRpcRouter.post("referrals.create_code", ...handleGetReferralCode);
referralRpcRouter.post("referrals.redeem_code", ...handleRedeemReferral);
