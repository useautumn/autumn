import {
	type ApiReferralProgramV0,
	type CatalogConfigResourcePreview,
	type CatalogUpdateParams,
	type CreateReferralProgramParams,
	type CreateRewardParams,
	type CreateRewardResponse,
	checkScopes,
	ErrCode,
	RecaseError,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	createApiReferralProgram,
	deleteApiReferralProgram,
} from "@/internal/rewards/actions/referralProgramCrud/index.js";
import { deleteApiReward } from "@/internal/rewards/actions/rewardCrud/index.js";
import { createApiReward } from "@/internal/rewards/actions/createApiReward/createApiReward.js";
import { getApiReferralProgram } from "@/internal/rewards/apiRewards/getApiReferralProgram.js";
import {
	rewardProgramRepo,
	rewardRepo,
} from "@/internal/rewards/repos/index.js";

const rewardId = (reward: CreateRewardParams) =>
	reward.coupon?.id ?? reward.feature_grant!.id;

export const assertCatalogConfigResourceScope = ({
	ctx,
	params,
	scope,
}: {
	ctx: AutumnContext;
	params: CatalogUpdateParams;
	scope: "rewards:read" | "rewards:write";
}) => {
	if (
		(params.rewards === undefined && params.referral_programs === undefined) ||
		!ctx.scopes.length
	)
		return;
	const { allowed, missing } = checkScopes([scope], ctx.scopes);
	if (allowed) return;
	throw new RecaseError({
		message: `Insufficient scopes. Missing: ${missing.join(", ")}`,
		code: ErrCode.InsufficientScopes,
		statusCode: 403,
	});
};

const canonical = (value: unknown): unknown => {
	if (Array.isArray(value)) {
		return value
			.map(canonical)
			.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
	}
	if (!value || typeof value !== "object") return value;
	return Object.fromEntries(
		Object.entries(value)
			.filter(([key, item]) => key !== "created_at" && item !== undefined)
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([key, item]) => [key, canonical(item)]),
	);
};

const comparable = (value: unknown): string => JSON.stringify(canonical(value));

const comparableReward = (
	reward: CreateRewardParams | CreateRewardResponse,
) => {
	if (reward.coupon) {
		return comparable({
			coupon: {
				...reward.coupon,
				duration: {
					...reward.coupon.duration,
					length:
						reward.coupon.duration.type === "months"
							? reward.coupon.duration.length
							: null,
				},
				promo_codes: reward.coupon.promo_codes.map((code) => ({
					...code,
					global_max_redemption: code.global_max_redemption ?? null,
					first_time_transaction: code.first_time_transaction ?? false,
				})),
			},
		});
	}
	return comparable({
		feature_grant: {
			...reward.feature_grant,
			promo_codes: reward.feature_grant!.promo_codes.map((code) => ({
				...code,
				max_uses: code.max_uses ?? null,
			})),
		},
	});
};

const comparableProgram = (
	program: CreateReferralProgramParams | ApiReferralProgramV0,
) =>
	comparable({
		...program,
		max_redemptions: program.max_redemptions ?? null,
		plan_ids: program.plan_ids?.filter(Boolean).length
			? program.plan_ids.filter(Boolean)
			: null,
		exclude_trial: program.exclude_trial ?? false,
	});

export const resolveCatalogConfigResources = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: CatalogUpdateParams;
}) => {
	const rewards =
		params.rewards !== undefined
			? await rewardRepo.listApiRewards({
					db: ctx.db,
					orgId: ctx.org.id,
					env: ctx.env,
					features: ctx.features,
				})
			: { coupons: [], feature_grants: [] };
	const rewardById = new Map<string, CreateRewardResponse>([
		...rewards.coupons.map((coupon) => [coupon.id, { coupon }] as const),
		...rewards.feature_grants.map(
			(feature_grant) => [feature_grant.id, { feature_grant }] as const,
		),
	]);
	const [rawRewards, programs] =
		params.referral_programs !== undefined
			? await Promise.all([
					rewardRepo.list({ db: ctx.db, orgId: ctx.org.id, env: ctx.env }),
					rewardProgramRepo.list({
						db: ctx.db,
						orgId: ctx.org.id,
						env: ctx.env,
					}),
				])
			: [[], []];
	const rewardIdByInternalId = new Map(
		rawRewards.map(({ internal_id, id }) => [internal_id, id]),
	);
	const programById = new Map<string, ApiReferralProgramV0>();
	for (const program of programs) {
		const id = rewardIdByInternalId.get(program.internal_reward_id);
		if (id) {
			programById.set(
				program.id,
				getApiReferralProgram({ rewardProgram: program, rewardId: id }),
			);
		}
	}

	return { rewardById, programById };
};

export const previewCatalogConfigResources = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: CatalogUpdateParams;
}) => {
	const { rewardById, programById } = await resolveCatalogConfigResources({
		ctx,
		params,
	});
	const rewardChanges: CatalogConfigResourcePreview[] = (
		params.rewards ?? []
	).map((reward) => {
		const id = rewardId(reward);
		const existing = rewardById.get(id);
		return {
			id,
			action: !existing
				? "created"
				: comparableReward(existing) === comparableReward(reward)
					? "none"
					: "conflict",
		};
	});
	if (!params.skip_deletions && params.rewards !== undefined) {
		const desiredIds = new Set(params.rewards.map(rewardId));
		for (const id of rewardById.keys()) {
			if (!desiredIds.has(id)) rewardChanges.push({ id, action: "deleted" });
		}
	}
	const referralProgramChanges: CatalogConfigResourcePreview[] = (
		params.referral_programs ?? []
	).map((program) => {
		const existing = programById.get(program.id);
		return {
			id: program.id,
			action: !existing
				? "created"
				: comparableProgram(existing) === comparableProgram(program)
					? "none"
					: "conflict",
		};
	});
	if (!params.skip_deletions && params.referral_programs !== undefined) {
		const desiredIds = new Set(
			params.referral_programs.map((program) => program.id),
		);
		for (const id of programById.keys()) {
			if (!desiredIds.has(id))
				referralProgramChanges.push({ id, action: "deleted" });
		}
	}

	return { rewardChanges, referralProgramChanges };
};

export const assertNoCatalogConfigConflicts = ({
	rewardChanges,
	referralProgramChanges,
}: Awaited<ReturnType<typeof previewCatalogConfigResources>>) => {
	const conflicts = [...rewardChanges, ...referralProgramChanges].filter(
		({ action }) => action === "conflict",
	);
	if (!conflicts.length) return;
	throw new RecaseError({
		message: `Config resources already exist with different definitions: ${conflicts.map(({ id }) => id).join(", ")}`,
		code: ErrCode.InvalidRequest,
		statusCode: 409,
	});
};

export const applyCatalogConfigResources = async ({
	ctx,
	params,
	preview,
}: {
	ctx: AutumnContext;
	params: CatalogUpdateParams;
	preview: Awaited<ReturnType<typeof previewCatalogConfigResources>>;
}) => {
	for (const { id, action } of preview.referralProgramChanges) {
		if (action === "deleted") {
			await deleteApiReferralProgram({
				ctx,
				params: { referral_program_id: id },
			});
		}
	}
	for (const { id, action } of preview.rewardChanges) {
		if (action === "deleted") {
			await deleteApiReward({ ctx, params: { reward_id: id } });
		}
	}
	for (const [index, reward] of (params.rewards ?? []).entries()) {
		if (preview.rewardChanges[index]?.action === "created") {
			await createApiReward({ ctx, params: reward });
		}
	}
	for (const [index, program] of (params.referral_programs ?? []).entries()) {
		if (preview.referralProgramChanges[index]?.action === "created") {
			await createApiReferralProgram({ ctx, params: program });
		}
	}
};
