import type { ReferralProgram, Reward } from "../../../compose/index.js";
import { formatValue, idToVarName } from "./helpers.js";

export const buildRewardCode = (reward: Reward, varName?: string): string =>
	`export const ${varName ?? idToVarName(`reward-${reward.id}`)} = reward(${formatValue(reward)});`;

export const buildReferralProgramCode = (
	program: ReferralProgram,
	varName?: string,
): string =>
	`export const ${varName ?? idToVarName(`referral-program-${program.id}`)} = referralProgram(${formatValue(program)});`;
