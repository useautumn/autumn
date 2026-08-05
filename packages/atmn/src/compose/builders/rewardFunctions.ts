import type { ReferralProgram, Reward } from "../models/rewardModels.js";

type ConfigInput<T> = T extends unknown ? Omit<T, "__atmnType"> : never;

const tagged = <T extends object>(value: T, type: string): T => {
	Object.defineProperty(value, "__atmnType", {
		value: type,
		enumerable: false,
	});
	return value;
};

export const reward = (params: ConfigInput<Reward>): Reward =>
	tagged(params as Reward, "reward");

export const referralProgram = (
	params: ConfigInput<ReferralProgram>,
): ReferralProgram => tagged(params, "referral_program");
