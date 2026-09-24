import { subjectToAutoTopupTriggers } from "@autumn/auto-topup";
import type { WorkerFullSubject } from "@autumn/balance-engine";
import {
	type Feature,
	type FullSubject,
	fullSubjectToFullCustomer,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { dispatchAutoTopup } from "./helpers/dispatchAutoTopup.js";
import { sendAutoTopupFailedWebhook } from "./webhooks/sendAutoTopupFailedWebhook.js";

const isServerSubject = (
	fullSubject: FullSubject | WorkerFullSubject,
): fullSubject is FullSubject => "subjectType" in fullSubject;

/** After a deduction or a check: dispatch a job for every feature at or under its top-up threshold. */
export const triggerAutoTopUp = async ({
	ctx,
	fullSubject,
	feature,
	now = Date.now(),
}: {
	ctx: AutumnContext;
	/** The server's own view, or the worker's reply; the predicate reads either. */
	fullSubject: FullSubject | WorkerFullSubject;
	feature: Feature;
	now?: number;
}) => {
	const triggers = subjectToAutoTopupTriggers({
		fullSubject,
		featureId: feature.id,
		now,
	});
	const customerId =
		fullSubject.customer.id || fullSubject.customer.internal_id;

	for (const { featureId, autoTopupConfig } of triggers) {
		const dispatched = await dispatchAutoTopup({ ctx, customerId, featureId });

		if (dispatched.reason === "redis_unavailable" && autoTopupConfig) {
			await sendAutoTopupFailedWebhook({
				ctx,
				customerId,
				featureId,
				reason: "redis_unavailable",
				message: `Redis unavailable, skipping auto top-up enqueue for customer ${customerId} and feature ${featureId}`,
				fullCustomer: isServerSubject(fullSubject)
					? fullSubjectToFullCustomer({ fullSubject })
					: undefined,
				autoTopupConfig,
				suppressionKey: `auto_topup_failed_webhook:${ctx.org.id}:${ctx.env}:${customerId}:${featureId}:redis_unavailable:${Math.floor(Date.now() / 3_600_000)}`,
				suppressionTtlMs: 3_600_000,
			});
		}
	}
};
