import type { ReferralProgram, Reward } from "../../../compose/index.js";
import { formatValue, idToVarName } from "./helpers.js";

export const buildRewardCode = (reward: Reward): string =>
	`export const ${idToVarName(`reward-${reward.id}`)} = reward(${formatValue(reward)});`;

export const buildReferralProgramCode = (program: ReferralProgram): string =>
	`export const ${idToVarName(`referral-program-${program.id}`)} = referralProgram(${formatValue(program)});`;
