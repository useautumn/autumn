import { type AutumnBillingPlan, InternalError } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { switchFullSubjectBalanceGeneration } from "@/internal/customers/cache/fullSubject/actions/switchFullSubjectBalanceGeneration.js";
import { buildFullSubjectBalanceHandoffLockKey } from "@/internal/customers/cache/fullSubject/builders/buildFullSubjectBalanceGenerationKey.js";
import { RELEVANT_STATUSES } from "@/internal/customers/cusProducts/CusProductService.js";
import { getFullSubjectNormalized } from "@/internal/customers/repos/getFullSubject/index.js";
import { buildAttachBalanceHandoffTarget } from "./buildAttachBalanceHandoffTarget.js";
import { fenceAttachBalanceHandoffCacheVersions } from "./fenceAttachBalanceHandoffCacheVersions.js";
import { persistAttachBalanceHandoffRuntime } from "./persistAttachBalanceHandoffRuntime.js";
import {
	ATTACH_BALANCE_HANDOFF_LOCK_TTL_MS,
	type PreparedAttachBalanceHandoff,
} from "./prepareAttachBalanceHandoff.js";

export const executeAttachBalanceHandoff = async ({
	ctx,
	autumnBillingPlan,
	prepared,
}: {
	ctx: AutumnContext;
	autumnBillingPlan: AutumnBillingPlan;
	prepared: PreparedAttachBalanceHandoff | undefined;
}): Promise<void> => {
	if (!prepared) return;
	const entityId = autumnBillingPlan.attachBalanceHandoff?.entityId;
	ctx.preserveFullSubjectCache = true;
	const lockKey = buildFullSubjectBalanceHandoffLockKey({
		orgId: ctx.org.id,
		env: ctx.env,
		customerId: autumnBillingPlan.customerId,
	});

	const postgresSubject = await getFullSubjectNormalized({
		ctx,
		customerId: autumnBillingPlan.customerId,
		entityId,
		inStatuses: RELEVANT_STATUSES,
		runLazyResets: false,
		readFrom: "primary",
		routeSource: "executeAttachBalanceHandoff",
	});
	if (!postgresSubject) {
		throw new InternalError({
			message: "Could not load the attached customer for balance handoff",
			code: "balance_handoff_customer_missing",
		});
	}

	const plannedTargetCustomerProduct =
		autumnBillingPlan.insertCustomerProducts.find(
			(customerProduct) =>
				customerProduct.id ===
				autumnBillingPlan.attachBalanceHandoff?.targetCustomerProductId,
		);
	const plannedTargetRolloverIds = new Set(
		plannedTargetCustomerProduct?.customer_entitlements.flatMap(
			(customerEntitlement) =>
				customerEntitlement.rollovers.map((rollover) => rollover.id),
		) ?? [],
	);
	let fencedSourceForAttempt: typeof postgresSubject.normalized | undefined;
	let allowedCacheVersionsByIdForAttempt: Map<string, number[]> | undefined;
	const switchResult = await switchFullSubjectBalanceGeneration({
		ctx,
		customerId: autumnBillingPlan.customerId,
		entityId,
		expectedGeneration: prepared.expectedGeneration,
		lockToken: prepared.lockToken,
		buildTargetFromSnapshot: ({ snapshot }) => {
			const target = buildAttachBalanceHandoffTarget({
				ctx,
				autumnBillingPlan,
				runtimeNormalized: snapshot.normalized,
				postgresNormalized: postgresSubject.normalized,
			});
			const fenced = fenceAttachBalanceHandoffCacheVersions({
				source: snapshot.normalized,
				target,
			});
			fencedSourceForAttempt = fenced.source;
			allowedCacheVersionsByIdForAttempt = fenced.allowedCacheVersionsById;
			return fenced.target;
		},
		prepareTargetForSwitch: async ({ target }) => {
			if (!fencedSourceForAttempt || !allowedCacheVersionsByIdForAttempt) {
				throw new InternalError({
					message: "Could not prepare the source balance fence",
					code: "balance_handoff_source_missing",
				});
			}
			const refreshed = await ctx.redisV2.refreshOwnedLock(
				lockKey,
				prepared.lockToken,
				ATTACH_BALANCE_HANDOFF_LOCK_TTL_MS.toString(),
			);
			if (refreshed !== 1) {
				throw new InternalError({
					message: "Lost the live balance handoff reservation",
					code: "balance_handoff_lock_lost",
				});
			}
			const finalRolloverIds = new Set(
				target.normalized.customer_entitlements.flatMap((subjectBalance) =>
					subjectBalance.rollovers.map((rollover) => rollover.id),
				),
			);
			// The Redis CAS can retry when a track lands during this write. Each
			// retry rewrites the same structural rows from the newer exact source.
			await persistAttachBalanceHandoffRuntime({
				ctx,
				source: fencedSourceForAttempt,
				target: target.normalized,
				allowedCacheVersionsById: allowedCacheVersionsByIdForAttempt,
				rolloverIdsToDelete: [...plannedTargetRolloverIds].filter(
					(rolloverId) => !finalRolloverIds.has(rolloverId),
				),
			});
		},
	});

	if (switchResult.status !== "switched") {
		throw new InternalError({
			message: `Could not atomically publish the attached balance: ${switchResult.reason}`,
			code: "balance_handoff_conflict",
		});
	}

	// Redis B is now live. Do not let route or webhook middleware delete it.
	ctx.preserveFullSubjectCache = true;
};
