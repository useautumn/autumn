import { ErrCode, RecaseError, type UpdateCatalogParams } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { UpdateCatalogContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type { UpdateCatalogPlan } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogPlan";
import { rewardBranchOf } from "@/internal/catalogV2/actions/updateCatalog/utils/rewardUpdateUtils/rewardBranch";
import { ProductService } from "@/internal/products/ProductService.js";

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

const assertRewardIdentitiesAgree = ({
	params,
	catalogContext,
}: {
	params: UpdateCatalogParams;
	catalogContext: UpdateCatalogContext;
}) => {
	const { rewards, programs, unstatableInternalIds, hiddenProgramInternalIds } =
		catalogContext.rewardStatesContext;

	for (const entry of params.rewards ?? []) {
		const { body } = rewardBranchOf(entry);
		if (body.internal_id === undefined) continue;
		if (unstatableInternalIds.has(body.internal_id))
			invalid(
				`Reward ${body.id} states the internal_id of a free product or invoice credit reward, which a config cannot state. Remove the internal_id from your config.`,
			);
		const current = rewards.find(
			(reward) => reward.internalId === body.internal_id,
		);
		if (current && current.id !== body.id)
			invalid(
				`Reward ${current.id} cannot be renamed to ${body.id}. Reward ids are fixed; remove the reward and create a new one instead.`,
			);
	}

	for (const entry of params.referral_programs ?? []) {
		if (entry.internal_id === undefined) continue;
		if (hiddenProgramInternalIds.has(entry.internal_id))
			invalid(
				`Referral program ${entry.id} states the internal_id of a program on a free product or invoice credit reward, which a config cannot state. Remove the internal_id from your config.`,
			);
		const current = programs.find(
			(state) => state.internalId === entry.internal_id,
		);
		if (current && current.program.id !== entry.id)
			invalid(
				`Referral program ${current.program.id} cannot be renamed to ${entry.id}. Program ids are fixed; remove the program and create a new one instead.`,
			);
	}
};

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

const assertProgramRewardsResolve = ({
	catalogContext,
	updateCatalogPlan,
}: {
	catalogContext: UpdateCatalogContext;
	updateCatalogPlan: UpdateCatalogPlan;
}) => {
	const { rewards } = catalogContext.rewardStatesContext;
	const removedIds = new Set(
		updateCatalogPlan.removeRewards.map((remove) => remove.rewardId),
	);
	const surviving = new Set([
		...updateCatalogPlan.upsertRewards.map((upsert) => upsert.rewardId),
		...rewards.map((reward) => reward.id).filter((id) => !removedIds.has(id)),
	]);

	for (const program of updateCatalogPlan.upsertReferralPrograms) {
		if (surviving.has(program.rewardId)) continue;
		invalid(
			`Referral program ${program.referralProgramId} references reward ${program.rewardId}, which this catalog does not have. Add the reward or remove the program.`,
		);
	}
};

const assertRemovedRewardsAreUnlinked = ({
	catalogContext,
	updateCatalogPlan,
}: {
	catalogContext: UpdateCatalogContext;
	updateCatalogPlan: UpdateCatalogPlan;
}) => {
	if (updateCatalogPlan.removeRewards.length === 0) return;

	const removedProgramIds = new Set(
		updateCatalogPlan.removeReferralPrograms.map(
			(remove) => remove.referralProgramId,
		),
	);
	const repointedProgramIds = new Set(
		updateCatalogPlan.upsertReferralPrograms
			.filter((upsert) => upsert.internalId !== null)
			.map((upsert) => upsert.referralProgramId),
	);

	for (const remove of updateCatalogPlan.removeRewards) {
		const blockers = catalogContext.rewardStatesContext.programs
			.filter((state) => state.internalRewardId === remove.internalId)
			.map((state) => state.program.id)
			.filter(
				(programId) =>
					!removedProgramIds.has(programId) &&
					!repointedProgramIds.has(programId),
			);
		if (blockers.length === 0) continue;
		invalid(
			`Reward ${remove.rewardId} is linked to referral programs: ${blockers.join(", ")}. Remove them in the same push, or point them at another reward.`,
		);
	}
};

const assertRewardReferencesResolve = async ({
	ctx,
	updateCatalogPlan,
}: {
	ctx: AutumnContext;
	updateCatalogPlan: UpdateCatalogPlan;
}) => {
	const featureIds = new Set(
		updateCatalogPlan.projected.features.map((feature) => feature.id),
	);
	const renamedTo = new Map(
		updateCatalogPlan.renamePlans.map(({ planId, toId }) => [planId, toId]),
	);
	const survivingPlanIds = new Set(
		updateCatalogPlan.projected.products.map(
			(product) => renamedTo.get(product.id) ?? product.id,
		),
	);
	const vacatedPlanIds = new Set(
		[
			...updateCatalogPlan.renamePlans.map(({ planId }) => planId),
			...updateCatalogPlan.removePlans.map(({ planId }) => planId),
		].filter((planId) => !survivingPlanIds.has(planId)),
	);
	const couponPlans = new Map<string, string[]>();
	for (const upsert of updateCatalogPlan.upsertRewards) {
		const branch = rewardBranchOf(upsert.params);
		if (branch.kind === "coupon") {
			couponPlans.set(upsert.rewardId, branch.body.plan_ids ?? []);
			continue;
		}
		for (const grant of branch.body.grants) {
			if (featureIds.has(grant.feature_id)) continue;
			invalid(
				`Reward ${upsert.rewardId} grants feature ${grant.feature_id}, which this catalog does not have.`,
			);
		}
	}

	const unresolved = [
		...new Set(
			[...couponPlans.values()]
				.flat()
				.filter((planId) => !survivingPlanIds.has(planId)),
		),
	];
	const known =
		unresolved.length === 0
			? new Set<string>()
			: new Set(
					(
						await ProductService.listFull({
							db: ctx.db,
							orgId: ctx.org.id,
							env: ctx.env,
							inIds: unresolved,
						})
					).map((plan) => plan.id),
				);

	for (const [rewardId, planIds] of couponPlans) {
		for (const planId of planIds) {
			if (vacatedPlanIds.has(planId))
				invalid(
					`Reward ${rewardId} applies to plan ${planId}, which this request removes or renames. Point the reward at the plan id this catalog keeps.`,
				);
			if (survivingPlanIds.has(planId) || known.has(planId)) continue;
			invalid(
				`Reward ${rewardId} applies to plan ${planId}, which this catalog does not have.`,
			);
		}
	}
};

const assertIdsNotHeldByHiddenPrograms = ({
	params,
	catalogContext,
}: {
	params: UpdateCatalogParams;
	catalogContext: UpdateCatalogContext;
}) => {
	const { hiddenProgramIds } = catalogContext.rewardStatesContext;
	for (const entry of params.referral_programs ?? []) {
		if (!hiddenProgramIds.has(entry.id)) continue;
		throw new RecaseError({
			message: `Referral program ${entry.id} already exists against a free product or invoice credit reward, which a config cannot state. Rename the program in your config or remove the existing one from the dashboard.`,
			code: ErrCode.InvalidRequest,
			statusCode: 409,
		});
	}
};

export const handleRewardErrors = async ({
	ctx,
	params,
	catalogContext,
	updateCatalogPlan,
}: {
	ctx: AutumnContext;
	params: UpdateCatalogParams;
	catalogContext: UpdateCatalogContext;
	updateCatalogPlan: UpdateCatalogPlan;
}) => {
	assertDistinctIds({ params });
	assertIdsNotHeldByUnstatableRewards({ params, catalogContext });
	assertIdsNotHeldByHiddenPrograms({ params, catalogContext });
	assertRewardIdentitiesAgree({ params, catalogContext });
	assertBranchUnchanged({ updateCatalogPlan, catalogContext });
	assertProgramRewardsResolve({ catalogContext, updateCatalogPlan });
	assertRemovedRewardsAreUnlinked({ catalogContext, updateCatalogPlan });
	await assertRewardReferencesResolve({ ctx, updateCatalogPlan });
};
