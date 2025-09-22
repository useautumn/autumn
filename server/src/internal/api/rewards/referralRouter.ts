import express, { type Router } from "express";
import {
	handleGetRedemption,
	handleGetReferralCode,
	handleRedeemReferral,
} from "./handlers/referrals/index.js";

export const referralRouter: Router = express.Router();

// 1. Get referral code
referralRouter.post("/code", handleGetReferralCode);

referralRouter.post("/redeem", handleRedeemReferral);

export const redemptionRouter: Router = express.Router();

redemptionRouter.get("/:redemptionId", handleGetRedemption);
