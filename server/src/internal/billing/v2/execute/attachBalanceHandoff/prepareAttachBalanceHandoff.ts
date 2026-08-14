import { type AutumnBillingPlan, InternalError } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getCachedFullSubject } from "@/internal/customers/cache/fullSubject/actions/getCachedFullSubject.js";
import { getOrSetCachedFullSubject } from "@/internal/customers/cache/fullSubject/actions/getOrSetCachedFullSubject.js";
import { buildFullSubjectBalanceHandoffLockKey } from "@/internal/customers/cache/fullSubject/builders/buildFullSubjectBalanceGenerationKey.js";
import { isBalanceGenerationHandoffEnabled } from "@/internal/misc/miscellaneousEdgeConfig/miscellaneousEdgeConfigStore.js";

export const ATTACH_BALANCE_HANDOFF_LOCK_TTL_MS = 300_000;

export type PreparedAttachBalanceHandoff = {
	expectedGeneration: number;
	lockToken: string;
};

export const prepareAttachBalanceHandoff = async ({
	ctx,
	autumnBillingPlan,
}: {
	ctx: AutumnContext;
	autumnBillingPlan: AutumnBillingPlan;
}): Promise<PreparedAttachBalanceHandoff | undefined> => {
	if (
		!isBalanceGenerationHandoffEnabled() ||
		!autumnBillingPlan.attachBalanceHandoff
	) {
		return undefined;
	}
	const { entityId } = autumnBillingPlan.attachBalanceHandoff;
	// Fill A before taking the publication lock. A concurrent fill that starts
	// after this point is rejected atomically by the cache-write Lua once the
	// lock is owned, and no billing rows have changed yet.
	await getOrSetCachedFullSubject({
		ctx: { ...ctx, skipCache: false },
		customerId: autumnBillingPlan.customerId,
		entityId,
		source: "prepareAttachBalanceHandoff",
		runLazyResets: false,
		readFrom: "primary",
	});
	const lockToken = crypto.randomUUID();
	const lockKey = buildFullSubjectBalanceHandoffLockKey({
		orgId: ctx.org.id,
		env: ctx.env,
		customerId: autumnBillingPlan.customerId,
	});
	const acquired = await ctx.redisV2.set(
		lockKey,
		JSON.stringify({ owner: "attach", token: lockToken }),
		"PX",
		ATTACH_BALANCE_HANDOFF_LOCK_TTL_MS,
		"NX",
	);
	if (acquired !== "OK") {
		throw new InternalError({
			message: "Could not reserve the live balance handoff",
			code: "balance_handoff_busy",
		});
	}

	try {
		const { fullSubject, balanceGeneration } = await getCachedFullSubject({
			ctx,
			customerId: autumnBillingPlan.customerId,
			entityId,
			source: "prepareAttachBalanceHandoff:reserve",
			runLazyResets: false,
		});
		if (!fullSubject) {
			throw new InternalError({
				message: "Could not reserve the live balance handoff",
				code: "balance_handoff_prepare_failed",
			});
		}
		// From this point onward A is the only recoverable live view until the
		// atomic switch succeeds. Response/webhook middleware must not clear it if
		// later billing or Redis work fails.
		ctx.preserveFullSubjectCache = true;

		return {
			expectedGeneration: balanceGeneration,
			lockToken,
		};
	} catch (error) {
		await ctx.redisV2
			.deleteOwnedLock(lockKey, lockToken)
			.catch(() => undefined);
		throw error;
	}
};
