import { CusProductStatus, schedulePhases } from "@autumn/shared";
import { and, arrayOverlaps, gte, lt } from "drizzle-orm";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";
import type { StripeWebhookContext } from "../../../webhookMiddlewares/stripeWebhookContext.js";
import {
	getSchedulePhaseMoves,
	STRIPE_SECOND_PRECISION_MS,
} from "../getSchedulePhaseMoves.js";
import type { StripeScheduleUpdatedContext } from "../setupScheduleUpdatedContext.js";

/**
 * Applies phase-start moves to Autumn: for each moved phase, only the scheduled
 * customerProducts (and Autumn phase rows) anchored to its OLD start are
 * retargeted to the new start.
 */
export const resyncScheduledCustomerProductStartsAt = async ({
	ctx,
	eventContext,
}: {
	ctx: StripeWebhookContext;
	eventContext: StripeScheduleUpdatedContext;
}) => {
	const { db, org, env, logger } = ctx;
	const { schedule, previousPhases } = eventContext;
	if (schedule.status !== "not_started" || !previousPhases) return;
	const moves = getSchedulePhaseMoves({
		previousPhases,
		currentPhases: schedule.phases,
	});
	if (moves.length === 0) return;
	eventContext.results.movedPhaseStarts = moves;

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
		if (matchedProducts.length === 0) {
			logger.warn(
				`[handleStripeSubscriptionScheduleUpdated] no scheduled customerProduct anchored to moved phase start ${oldStartMs} on schedule ${schedule.id} — skipping`,
			);
			continue;
		}

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

		const updatedPhaseRows = await db
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
			)
			.returning({ id: schedulePhases.id });

		// 0 rows is normal for attach-origin schedules (no Autumn phase rows)
		logger.info(
			`[handleStripeSubscriptionScheduleUpdated] moved ${updatedPhaseRows.length} autumn phase row(s) ${oldStartMs} -> ${newStartMs} (schedule ${schedule.id})`,
		);
	}
};
