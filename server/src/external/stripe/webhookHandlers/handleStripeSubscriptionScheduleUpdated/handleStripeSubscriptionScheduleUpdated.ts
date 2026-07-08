import { CusProductStatus } from "@autumn/shared";
import type Stripe from "stripe";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";
import type { StripeWebhookContext } from "../../webhookMiddlewares/stripeWebhookContext.js";

// Stripe stores phase starts at second precision; Autumn stores ms. Ignore
// sub-second drift so Autumn's own schedule writes don't echo back as updates.
const STRIPE_SECOND_PRECISION_MS = 1000;

/**
 * Re-syncs scheduled customerProduct starts_at when a not-yet-started schedule
 * is rescheduled outside Autumn (e.g. Stripe dashboard). Started schedules and
 * multi-phase schedules are intentionally left alone.
 */
export const handleStripeSubscriptionScheduleUpdated = async ({
	ctx,
	schedule,
}: {
	ctx: StripeWebhookContext;
	schedule: Stripe.SubscriptionSchedule;
}) => {
	const { db, org, env, logger } = ctx;

	if (schedule.status !== "not_started") return;
	if (schedule.phases.length !== 1) return;

	const phaseStartMs = (schedule.phases[0]?.start_date ?? 0) * 1000;
	if (!phaseStartMs) return;

	const customerProductsOnSchedule = await CusProductService.getByScheduleId({
		db,
		scheduleId: schedule.id,
		orgId: org.id,
		env,
	});

	for (const customerProduct of customerProductsOnSchedule) {
		if (customerProduct.status !== CusProductStatus.Scheduled) continue;

		const driftMs = Math.abs((customerProduct.starts_at ?? 0) - phaseStartMs);
		if (driftMs < STRIPE_SECOND_PRECISION_MS) continue;

		await CusProductService.update({
			ctx,
			cusProductId: customerProduct.id,
			updates: { starts_at: phaseStartMs },
		});

		logger.info(
			`[handleStripeSubscriptionScheduleUpdated] resynced starts_at ${customerProduct.starts_at} -> ${phaseStartMs} for customerProduct ${customerProduct.id} (schedule ${schedule.id})`,
		);
	}
};
