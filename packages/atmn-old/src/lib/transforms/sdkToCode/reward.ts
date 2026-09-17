import type {ReferralProgram, Reward} from '../../../compose/index.js';
import {formatValueMultiline, idToVarName} from './helpers.js';

export const buildRewardCode = (reward: Reward, varName?: string): string =>
	`export const ${varName ?? idToVarName(`reward-${reward.id}`)} = reward(${formatValueMultiline(reward)});`;

export const buildReferralProgramCode = (
	program: ReferralProgram,
	varName?: string,
): string =>
	`export const ${varName ?? idToVarName(`referral-program-${program.id}`)} = referralProgram(${formatValueMultiline(program)});`;
