import { ErrCode, RecaseError, type UpdateCatalogParams } from "@autumn/shared";
import type { UpdateCatalogContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type { UpdateCatalogPlan } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogPlan";
import { rewardBranchOf } from "@/internal/catalogV2/actions/updateCatalog/utils/rewardUpdateUtils/rewardBranch";

const invalid = (message: string): never => {
	throw new RecaseError({
		message,
		code: ErrCode.InvalidRequest,
		statusCode: 400,
	});
};

const assertDistinctIds = ({ params }: { params: UpdateCatalogParams }) => {
	const rewardIds = (params.rewards ?? []).map(
		(entry) => rewardBranchOf(entry).body.id,
	);
	const programIds = (params.referral_programs ?? []).map(({ id }) => id);
	for (const [label, ids] of [
		["Reward", rewardIds],
		["Referral program", programIds],
	] as const) {
		const duplicate = ids.find((id, index) => ids.indexOf(id) !== index);
		if (duplicate !== undefined)
			invalid(`${label} ${duplicate} is stated more than once.`);
	}
};

/**
 * A reward the catalog cannot express — a free product, an invoice credit —
 * still owns its id. Claiming it would silently rewrite a row the config can
 * never state back, so the push is refused instead.
 */
const assertIdsNotHeldByUnstatableRewards = ({
	params,
	catalogContext,
}: {
	params: UpdateCatalogParams;
	catalogContext: UpdateCatalogContext;
}) => {
	const { unstatableIds } = catalogContext.rewardStatesContext;
	for (const entry of params.rewards ?? []) {
		const { body } = rewardBranchOf(entry);
		if (!unstatableIds.has(body.id)) continue;
		throw new RecaseError({
			message: `Reward ${body.id} already exists as a free product or invoice credit reward, which a config cannot state. Rename the reward in your config or remove the existing one from the dashboard.`,
			code: ErrCode.InvalidRequest,
			statusCode: 409,
		});
	}
};

/** A stated stable id must name a row, and must agree with the id beside it. */
const assertRewardIdentitiesAgree = ({
	params,
	catalogContext,
}: {
	params: UpdateCatalogParams;
	catalogContext: UpdateCatalogContext;
}) => {
	const { rewards, programs } = catalogContext.rewardStatesContext;

	for (const entry of params.rewards ?? []) {
		const { body } = rewardBranchOf(entry);
		if (body.internal_id === undefined) continue;
		const current = rewards.find(
			(reward) => reward.internalId === body.internal_id,
		);
		if (!current)
			throw new RecaseError({
				message: `Reward ${body.id} states an internalId no reward has.`,
				code: ErrCode.RewardNotFound,
				statusCode: 404,
			});
		if (current.id !== body.id)
			invalid(
				`Reward ${current.id} cannot be renamed to ${body.id}. Reward ids are fixed; remove the reward and create a new one instead.`,
			);
	}

	for (const entry of params.referral_programs ?? []) {
		if (entry.internal_id === undefined) continue;
		const current = programs.find(
			(state) => state.internalId === entry.internal_id,
		);
		if (!current)
			invalid(
				`Referral program ${entry.id} states an internalId no program has.`,
			);
		else if (current.program.id !== entry.id)
			invalid(
				`Referral program ${current.program.id} cannot be renamed to ${entry.id}. Program ids are fixed; remove the program and create a new one instead.`,
			);
	}
};

/** A stated reward keeps its branch: a coupon never becomes a feature grant. */
const assertBranchUnchanged = ({
	updateCatalogPlan,
	catalogContext,
}: {
	updateCatalogPlan: UpdateCatalogPlan;
	catalogContext: UpdateCatalogContext;
}) => {
	for (const upsert of updateCatalogPlan.upsertRewards) {
		if (upsert.internalId === null) continue;
		const current = catalogContext.rewardStatesContext.rewards.find(
			(reward) => reward.internalId === upsert.internalId,
		);
		if (current && current.kind !== upsert.kind)
			throw new RecaseError({
				message: `Reward ${upsert.rewardId} is a ${current.kind.replace("_", " ")} and cannot become a ${upsert.kind.replace("_", " ")}. Remove it and create a new reward instead.`,
				code: ErrCode.InvalidRequest,
				statusCode: 409,
			});
	}
};

/** Every program names a reward this catalog will hold once the push lands. */
const assertProgramRewardsResolve = ({
	catalogContext,
	updateCatalogPlan,
}: {
	catalogContext: UpdateCatalogContext;
	updateCatalogPlan: UpdateCatalogPlan;
}) => {
	const { rewards, unstatableIds } = catalogContext.rewardStatesContext;
	const removedIds = new Set(
		updateCatalogPlan.removeRewards.map((remove) => remove.rewardId),
	);
	const surviving = new Set([
		...updateCatalogPlan.upsertRewards.map((upsert) => upsert.rewardId),
		...unstatableIds,
		...rewards.map((reward) => reward.id).filter((id) => !removedIds.has(id)),
	]);

	for (const program of updateCatalogPlan.upsertReferralPrograms) {
		if (surviving.has(program.rewardId)) continue;
		invalid(
			`Referral program ${program.referralProgramId} references reward ${program.rewardId}, which this catalog does not have. Add the reward or remove the program.`,
		);
	}
};

export const handleRewardErrors = ({
	params,
	catalogContext,
	updateCatalogPlan,
}: {
	params: UpdateCatalogParams;
	catalogContext: UpdateCatalogContext;
	updateCatalogPlan: UpdateCatalogPlan;
}) => {
	assertDistinctIds({ params });
	assertIdsNotHeldByUnstatableRewards({ params, catalogContext });
	assertRewardIdentitiesAgree({ params, catalogContext });
	assertBranchUnchanged({ updateCatalogPlan, catalogContext });
	assertProgramRewardsResolve({ catalogContext, updateCatalogPlan });
};
