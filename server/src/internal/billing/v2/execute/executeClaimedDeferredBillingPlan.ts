import type { DeferredAutumnBillingPlanData, Metadata } from "@autumn/shared";
import type Stripe from "stripe";
import { acquireLock } from "@/external/redis/utils/lockUtils/acquireLock";
import { clearLock } from "@/external/redis/utils/lockUtils/clearLock";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { executeDeferredBillingPlan } from "@/internal/billing/v2/execute/executeDeferredBillingPlan";
import { MetadataService } from "@/internal/metadata/MetadataService";

// Outlives a normal execution; a crashed holder's lock expires so a Stripe retry can resume.
const DEFERRED_PLAN_LOCK_TTL_MS = 5 * 60 * 1000;

/** invoice.finalized and invoice.paid can race on the same deferred plan; only the lock holder executes it. */
export const executeClaimedDeferredBillingPlan = async ({
	ctx,
	metadata,
	stripeSubscription,
	stripeInvoice,
}: {
	ctx: AutumnContext;
	metadata: Metadata;
	stripeSubscription?: Stripe.Subscription;
	stripeInvoice?: Stripe.Invoice;
}): Promise<boolean> => {
	const data = metadata.data as DeferredAutumnBillingPlanData;
	if (data.orgId !== ctx.org.id || data.env !== ctx.env) return false;

	const lockKey = `lock:deferred-billing-plan:${ctx.org.id}:${ctx.env}:${metadata.id}`;
	const token = crypto.randomUUID();
	// A contender throws so its webhook is retried, and completes once the holder deleted the row.
	await acquireLock({
		lockKey,
		token,
		ttlMs: DEFERRED_PLAN_LOCK_TTL_MS,
		errorMessage: `Deferred billing plan ${metadata.id} is already executing`,
		failOpen: false,
	});

	try {
		const current = await MetadataService.get({ db: ctx.db, id: metadata.id });
		if (!current) {
			ctx.logger.info(
				`[deferred-invoice] Metadata ${metadata.id} already executed, skipping`,
			);
			return false;
		}

		await executeDeferredBillingPlan({
			ctx,
			metadata: current,
			stripeSubscription,
			stripeInvoice,
		});
		return true;
	} finally {
		await clearLock({ lockKey, token });
	}
};
