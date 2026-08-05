import type { ReferralProgram, Reward } from "../models/rewardModels.js";

const tagged = <T extends object>(value: T, type: string): T => {
	Object.defineProperty(value, "__atmnType", {
		value: type,
		enumerable: false,
	});
	return value;
};

export const reward = (params: Omit<Reward, "__atmnType">): Reward =>
	tagged(params as Reward, "reward");

export const referralProgram = (
	params: Omit<ReferralProgram, "__atmnType">,
): ReferralProgram => tagged(params, "referral_program");
