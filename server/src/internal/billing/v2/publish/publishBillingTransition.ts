import type { BillingContext, BillingPlan } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { publishCachedFullSubject } from "@/internal/customers/cache/fullSubject/actions/publishCachedFullSubject.js";
import { getFullSubjectNormalized } from "@/internal/customers/repos/getFullSubject/index.js";
import { persistOrQueuePublishedBalanceTransitions } from "./persistPublishedBalanceTransitions.js";
import { shouldPublishBillingTransition } from "./shouldPublishBillingTransition.js";

export const publishBillingTransition = async ({
	ctx,
	billingContext,
	billingPlan,
	executionDeferred,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	billingPlan: BillingPlan;
	executionDeferred?: boolean;
}): Promise<void> => {
	// 1. Decide whether this plan has a supported runtime transition
	const decision = shouldPublishBillingTransition({
		ctx,
		billingPlan,
		executionDeferred,
	});
	if (!decision.shouldPublish) {
		if (decision.unsupportedReason) {
			ctx.logger.info(
				{ unsupportedReason: decision.unsupportedReason },
				"[publishBillingTransition] Skipped unsupported balance transition",
			);
		}
		return;
	}

	const customerId =
		billingContext.fullCustomer.id ?? billingContext.fullCustomer.internal_id;

	try {
		// 2. Load the final Postgres subject written by the billing plan
		const finalSubject = await getFullSubjectNormalized({
			ctx,
			customerId,
			entityId: billingContext.fullCustomer.entity?.id ?? undefined,
			runLazyResets: false,
			readFrom: "primary",
			routeSource: "publishBillingTransition",
		});
		if (!finalSubject) {
			ctx.logger.warn(
				"[publishBillingTransition] Final subject was unavailable after execution",
			);
			return;
		}

		// 3. Atomically rebase live A usage onto B and publish the new view
		const publishResult = await publishCachedFullSubject({
			ctx,
			normalized: finalSubject.normalized,
			balanceTransitionPlan: decision.balanceTransitionPlan,
		});
		if (publishResult.status === "UNSUPPORTED") {
			ctx.logger.info(
				{ unsupportedReason: publishResult.reason },
				"[publishBillingTransition] Skipped unsupported balance transition",
			);
			return;
		}
		if (publishResult.status !== "OK") return;

		// 4. Preserve the atomically published subject view
		ctx.skipSubjectCacheDeletion = true;
		// 5. Persist its exact balance to Postgres or queue a guarded retry
		await persistOrQueuePublishedBalanceTransitions({
			ctx,
			customerId,
			balanceTransitions: publishResult.balanceTransitions,
		});
	} catch (error) {
		ctx.logger.warn(
			{ error },
			"[publishBillingTransition] Failed to complete balance transition",
		);
	}
};
