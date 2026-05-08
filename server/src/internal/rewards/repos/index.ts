import { deleteReward } from "./deleteReward.js";
import { deleteRewardProgram } from "./deleteRewardProgram.js";
import { deleteRewardsByOrgId } from "./deleteRewardsByOrgId.js";
import { getRedemptionById } from "./getRedemptionById.js";
import { getRedemptionsByCustomer } from "./getRedemptionsByCustomer.js";
import { getRedemptionsByReferrer } from "./getRedemptionsByReferrer.js";
import { getReferralCode } from "./getReferralCode.js";
import { getReferralCodeByCustomerAndProgram } from "./getReferralCodeByCustomerAndProgram.js";
import { getReferralCodeRedemptionCount } from "./getReferralCodeRedemptionCount.js";
import { getReward } from "./getReward.js";
import { getRewardProgram } from "./getRewardProgram.js";
import { getRewardProgramsByProductId } from "./getRewardProgramsByProductId.js";
import { getRewardsByIdOrCode } from "./getRewardsByIdOrCode.js";
import { getRewardsInIds } from "./getRewardsInIds.js";
import { getUnappliedRedemptions } from "./getUnappliedRedemptions.js";
import { insertRedemption } from "./insertRedemption.js";
import { insertReferralCode } from "./insertReferralCode.js";
import { insertReward } from "./insertReward.js";
import { insertRewardProgram } from "./insertRewardProgram.js";
import { listRewardPrograms } from "./listRewardPrograms.js";
import { listRewards } from "./listRewards.js";
import { resetCustomerRedemptions } from "./resetCustomerRedemptions.js";
import { updateRedemption } from "./updateRedemption.js";
import { updateReward } from "./updateReward.js";
import { updateRewardProgram } from "./updateRewardProgram.js";

export const rewardRepo = {
	get: getReward,
	getByIdOrCode: getRewardsByIdOrCode,
	getInIds: getRewardsInIds,
	list: listRewards,
	insert: insertReward,
	update: updateReward,
	delete: deleteReward,
	deleteByOrgId: deleteRewardsByOrgId,
};

export const rewardProgramRepo = {
	get: getRewardProgram,
	list: listRewardPrograms,
	getByProductId: getRewardProgramsByProductId,
	insert: insertRewardProgram,
	update: updateRewardProgram,
	delete: deleteRewardProgram,
};

export const referralCodeRepo = {
	get: getReferralCode,
	getByCustomerAndProgram: getReferralCodeByCustomerAndProgram,
	insert: insertReferralCode,
	getRedemptionCount: getReferralCodeRedemptionCount,
};

export const redemptionRepo = {
	getById: getRedemptionById,
	getByCustomer: getRedemptionsByCustomer,
	getByReferrer: getRedemptionsByReferrer,
	insert: insertRedemption,
	update: updateRedemption,
	getUnapplied: getUnappliedRedemptions,
	resetCustomer: resetCustomerRedemptions,
};
