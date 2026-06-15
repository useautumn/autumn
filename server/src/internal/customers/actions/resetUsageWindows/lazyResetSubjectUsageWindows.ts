import {
	type FullSubject,
	fullSubjectToUsageWindowLimits,
	type NormalizedFullSubject,
	orgToInStatuses,
} from "@autumn/shared";
import * as Sentry from "@sentry/bun";
import { getDbHealth, PgHealth } from "@/db/pgHealthMonitor.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { usageWindowRepo } from "@/internal/customers/usageWindows/repos/index.js";
import { applyUsageWindowRollsToSubject } from "./applyUsageWindowRollsToSubject.js";
import { computeUsageWindowRolls } from "./computeUsageWindowRolls.js";
import { rollUsageWindowsCache } from "./rollUsageWindowsCache.js";

/**
 * Lazily ROLLS the subject's usage-window counters on every subject read:
 * zero counts whose stored window closed, and re-align bounds/anchor to the
 * current derivation (this is where a plan change lands in the DB). The
 * decision table lives in computeUsageWindowRolls.
 *
 * Best-effort, like lazyResetSubjectEntitlements: reads and the deduction
 * script both derive a closed count as 0 and stamp fresh bounds on write, so
 * a failed roll only delays persistence. Rolls are idempotent (same target
 * state), so concurrent reads converge. Returns true if any rows rolled.
 */
export const lazyResetSubjectUsageWindows = async ({
	ctx,
	fullSubject,
	normalized,
}: {
	ctx: AutumnContext;
	fullSubject: FullSubject;
	normalized?: NormalizedFullSubject;
}): Promise<boolean> => {
	if (getDbHealth() === PgHealth.Degraded) return false;

	const now = Date.now();
	const usageWindows = fullSubject.usage_windows ?? [];
	if (usageWindows.length === 0) return false;

	try {
		const limits = fullSubjectToUsageWindowLimits({
			fullSubject,
			featureIds: [
				...new Set(usageWindows.map((usageWindow) => usageWindow.feature_id)),
			],
			features: ctx.features,
			now,
			inStatuses: orgToInStatuses({ org: ctx.org }),
		});

		const rolls = computeUsageWindowRolls({ usageWindows, limits, now });
		if (rolls.length === 0) return false;

		ctx.logger.info(
			`[lazyResetSubjectUsageWindows] customer: ${fullSubject.customerId}, rolling: ${rolls.length}`,
		);

		await usageWindowRepo.rollWindows({ db: ctx.db, rolls, now });
		await rollUsageWindowsCache({
			ctx,
			customerId: fullSubject.customerId,
			rolls,
			now,
		});
		applyUsageWindowRollsToSubject({ fullSubject, normalized, rolls, now });

		return true;
	} catch (error) {
		ctx.logger.error(
			`[lazyResetSubjectUsageWindows] customer: ${fullSubject.customerId}, failed: ${error}`,
		);
		Sentry.captureException(error);
		return false;
	}
};
