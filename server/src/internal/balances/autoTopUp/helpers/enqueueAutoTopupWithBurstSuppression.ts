import { claimAutoTopupPendingKey } from "@/external/redis/actions/autoTopUpSuppression/autoTopUpSuppression.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { workflows } from "@/queue/workflows.js";

export const enqueueAutoTopupWithBurstSuppression = async ({
	ctx,
	customerId,
	featureId,
}: {
	ctx: AutumnContext;
	customerId: string;
	featureId: string;
}) => {
	const { org, env } = ctx;

	const claim = await claimAutoTopupPendingKey({ ctx, customerId, featureId });

	if (claim === "unavailable") {
		ctx.logger.warn(
			`[enqueueAutoTopupWithBurstSuppression] Redis unavailable, skipping auto top-up for customer ${customerId} and feature ${featureId}`,
		);
		return { enqueued: false, reason: "redis_unavailable" as const };
	}

	if (claim === "pending_exists") {
		ctx.logger.warn(
			`[enqueueAutoTopupWithBurstSuppression] Skipping auto top-up job for customer ${customerId} and feature ${featureId} because pending key already exists`,
		);
		return { enqueued: false, reason: "pending_key_exists" as const };
	}

	await workflows.triggerAutoTopUp({
		orgId: org.id,
		env,
		customerId,
		featureId,
	});

	ctx.logger.info(
		`[enqueueAutoTopupWithBurstSuppression] Auto top-up job enqueued for customer ${customerId} and feature ${featureId}`,
	);

	return { enqueued: true, reason: "enqueued" as const };
};
