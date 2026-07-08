import { CusProductStatus, schedulePhases } from "@autumn/shared";
import { and, arrayOverlaps, gte, lt } from "drizzle-orm";
import type Stripe from "stripe";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";
import type { StripeWebhookContext } from "../../webhookMiddlewares/stripeWebhookContext.js";

// Stripe stores phase starts at second precision; Autumn stores ms. Ignore
// sub-second drift so Autumn's own schedule writes don't echo back as updates.
const STRIPE_SECOND_PRECISION_MS = 1000;

type PhaseMove = { oldStartMs: number; newStartMs: number };

const getPhaseMoves = ({
	previousPhases,
	currentPhases,
}: {
	previousPhases: Stripe.SubscriptionSchedule.Phase[];
	currentPhases: Stripe.SubscriptionSchedule.Phase[];
}): PhaseMove[] => {
	const moves: PhaseMove[] = [];
	for (const [index, previousPhase] of previousPhases.entries()) {
		const oldStartMs = (previousPhase.start_date ?? 0) * 1000;
		const newStartMs = (currentPhases[index]?.start_date ?? 0) * 1000;
		if (!(oldStartMs && newStartMs)) continue;
		if (Math.abs(oldStartMs - newStartMs) < STRIPE_SECOND_PRECISION_MS)
			continue;
		moves.push({ oldStartMs, newStartMs });
	}
	return moves;
};

/**
 * Re-syncs scheduled customerProduct (and Autumn phase) starts_at when a
 * not-yet-started schedule is rescheduled outside Autumn (e.g. Stripe
 * dashboard). Each moved phase only touches the products anchored to its OLD
 * start; started schedules and phase add/remove are intentionally left alone.
 */
export const handleStripeSubscriptionScheduleUpdated = async ({
	ctx,
	event,
}: {
	ctx: StripeWebhookContext;
	event: Stripe.SubscriptionScheduleUpdatedEvent;
}) => {
	const { db, org, env, logger } = ctx;

	const schedule = event.data.object;
	const previousPhases = event.data.previous_attributes?.phases;

	if (schedule.status !== "not_started") return;
	if (!previousPhases) return;
	if (previousPhases.length !== schedule.phases.length) return;

	const moves = getPhaseMoves({
		previousPhases,
		currentPhases: schedule.phases,
	});
	if (moves.length === 0) return;

	const customerProductsOnSchedule = await CusProductService.getByScheduleId({
		db,
		scheduleId: schedule.id,
		orgId: org.id,
		env,
	});
	const scheduledProducts = customerProductsOnSchedule.filter(
		(customerProduct) => customerProduct.status === CusProductStatus.Scheduled,
	);

	for (const { oldStartMs, newStartMs } of moves) {
		const matchedProducts = scheduledProducts.filter(
			(customerProduct) =>
				Math.abs((customerProduct.starts_at ?? 0) - oldStartMs) <
				STRIPE_SECOND_PRECISION_MS,
		);
		if (matchedProducts.length === 0) continue;

		for (const customerProduct of matchedProducts) {
			await CusProductService.update({
				ctx,
				cusProductId: customerProduct.id,
				updates: { starts_at: newStartMs },
			});
			logger.info(
				`[handleStripeSubscriptionScheduleUpdated] resynced starts_at ${customerProduct.starts_at} -> ${newStartMs} for customerProduct ${customerProduct.id} (schedule ${schedule.id})`,
			);
		}

		await db
			.update(schedulePhases)
			.set({ starts_at: newStartMs })
			.where(
				and(
					gte(schedulePhases.starts_at, oldStartMs),
					lt(schedulePhases.starts_at, oldStartMs + STRIPE_SECOND_PRECISION_MS),
					arrayOverlaps(
						schedulePhases.customer_product_ids,
						matchedProducts.map((customerProduct) => customerProduct.id),
					),
				),
			);
	}
};
