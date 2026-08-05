import {
	type AppEnv,
	ErrCode,
	type Subscription,
	subscriptions,
} from "@autumn/shared";
import type { DrizzleCli } from "@server/db/initDrizzle.js";
import { subToPeriodStartEnd } from "@server/external/stripe/stripeSubUtils/convertSubUtils.js";
import RecaseError from "@server/utils/errorUtils.js";
import { generateId } from "@server/utils/genUtils.js";
import { and, eq, inArray } from "drizzle-orm";
import type Stripe from "stripe";

export class SubService {
	static async createSub({ db, sub }: { db: DrizzleCli; sub: Subscription }) {
		const data = await db.insert(subscriptions).values(sub).returning();

		if (data.length === 0) {
			throw new RecaseError({
				code: ErrCode.InsertSubscriptionFailed,
				message: "Failed to create subscription",
				statusCode: 500,
			});
		}

		return data[0] as Subscription;
	}

	/**
	 * Insert, or return null when a concurrent writer already claimed the
	 * stripe id. Callers that check-then-insert must handle the null by
	 * re-reading — two Stripe webhooks for one subscription arrive in parallel.
	 */
	static async createSubIfAbsent({
		db,
		sub,
	}: {
		db: DrizzleCli;
		sub: Subscription;
	}): Promise<Subscription | null> {
		const data = await db
			.insert(subscriptions)
			.values(sub)
			.onConflictDoNothing()
			.returning();

		return (data[0] as Subscription | undefined) ?? null;
	}

	static async addUsageFeatures({
		db,
		stripeId,
		scheduleId,
		usageFeatures,
		orgId,
		env,
	}: {
		db: DrizzleCli;
		stripeId?: string;
		scheduleId?: string;
		usageFeatures: string[];
		orgId: string;
		env: AppEnv;
	}) {
		if (!stripeId && !scheduleId) {
			throw new Error("Either stripeId or scheduleId must be provided");
		}

		const findSub = async () =>
			(
				await db
					.select()
					.from(subscriptions)
					.where(
						and(
							stripeId ? eq(subscriptions.stripe_id, stripeId) : undefined,
							scheduleId
								? eq(subscriptions.stripe_schedule_id, scheduleId)
								: undefined,
						),
					)
			)[0];

		const existingSub = await findSub();

		if (!existingSub) {
			const createdSub = await SubService.createSubIfAbsent({
				db,
				sub: {
					id: generateId("sub"),
					created_at: Date.now(),
					stripe_id: stripeId || null,
					stripe_schedule_id: scheduleId || null,
					usage_features: usageFeatures,
					org_id: orgId,
					env,
					current_period_start: null,
					current_period_end: null,
					billing_cycle_anchor_seconds: null,
				},
			});

			if (createdSub) return createdSub;
		}

		// Either it existed, or a concurrent webhook won the insert; merge into it.
		const curSub = existingSub ?? (await findSub());

		if (!curSub) {
			throw new RecaseError({
				code: ErrCode.InsertSubscriptionFailed,
				message: "Failed to create subscription",
				statusCode: 500,
			});
		}
		const updateResult = await db
			.update(subscriptions)
			.set({
				usage_features: [
					...new Set([...(curSub.usage_features || []), ...usageFeatures]),
				],
			})
			.where(eq(subscriptions.id, curSub.id))
			.returning();

		if (updateResult.length === 0) {
			throw new RecaseError({
				code: ErrCode.UpdateSubscriptionFailed,
				message: "Failed to update subscription",
				statusCode: 500,
			});
		}

		return updateResult[0] as Subscription;
	}

	static async update({
		db,
		subscriptionId,
		updates,
	}: {
		db: DrizzleCli;
		subscriptionId: string;
		updates: Partial<Subscription>;
	}) {
		return await db
			.update(subscriptions)
			.set(updates)
			.where(eq(subscriptions.id, subscriptionId))
			.returning();
	}

	static async updateFromStripe({
		db,
		stripeSub,
	}: {
		db: DrizzleCli;
		stripeSub: Stripe.Subscription;
	}) {
		const { start, end } = subToPeriodStartEnd({ sub: stripeSub });
		const results = await db
			.update(subscriptions)
			.set({
				current_period_start: start,
				current_period_end: end,
				billing_cycle_anchor_seconds: stripeSub.billing_cycle_anchor,
			})
			.where(eq(subscriptions.stripe_id, stripeSub.id))
			.returning();

		if (results.length === 0) {
			return null;
		}

		return results[0] as Subscription;
	}

	static async getFromScheduleId({
		db,
		scheduleId,
	}: {
		db: DrizzleCli;
		scheduleId: string;
	}) {
		const data = await db
			.select()
			.from(subscriptions)
			.where(eq(subscriptions.stripe_schedule_id, scheduleId));

		if (data.length === 0) {
			return null;
		}

		return data[0] as Subscription;
	}

	static async deleteFromScheduleId({
		db,
		scheduleId,
	}: {
		db: DrizzleCli;
		scheduleId: string;
	}) {
		await db
			.delete(subscriptions)
			.where(eq(subscriptions.stripe_schedule_id, scheduleId));

		return;
	}

	static async updateFromScheduleId({
		db,
		scheduleId,
		updates,
	}: {
		db: DrizzleCli;
		scheduleId: string;
		updates: any;
	}) {
		const results = await db
			.update(subscriptions)
			.set(updates)
			.where(eq(subscriptions.stripe_schedule_id, scheduleId))
			.returning();

		if (results.length === 0) {
			return null;
		}

		return results[0] as Subscription;
	}

	static async getInStripeIds({ db, ids }: { db: DrizzleCli; ids: string[] }) {
		return (await db
			.select()
			.from(subscriptions)
			.where(inArray(subscriptions.stripe_id, ids))) as Subscription[];
	}

	static async getByStripeId({
		db,
		stripeId,
	}: {
		db: DrizzleCli;
		stripeId: string;
	}) {
		return await db.query.subscriptions.findFirst({
			where: eq(subscriptions.stripe_id, stripeId),
		});
	}

	static async upsertByStripeId({
		db,
		subscription,
	}: {
		db: DrizzleCli;
		subscription: Subscription;
	}) {
		// 1. Get by stripe ID
		const existingSub = await SubService.getByStripeId({
			db,
			stripeId: subscription.stripe_id ?? "",
		});

		const periodUpdates = {
			current_period_start: subscription.current_period_start,
			current_period_end: subscription.current_period_end,
			billing_cycle_anchor_seconds: subscription.billing_cycle_anchor_seconds,
		};

		if (existingSub) {
			return await SubService.update({
				db,
				subscriptionId: existingSub.id,
				updates: periodUpdates,
			});
		}

		const createdSub = await SubService.createSubIfAbsent({
			db,
			sub: subscription,
		});

		if (createdSub) return createdSub;

		// A concurrent webhook inserted it between the read and the write.
		const winningSub = await SubService.getByStripeId({
			db,
			stripeId: subscription.stripe_id ?? "",
		});

		if (!winningSub) {
			throw new RecaseError({
				code: ErrCode.InsertSubscriptionFailed,
				message: "Failed to create subscription",
				statusCode: 500,
			});
		}

		return await SubService.update({
			db,
			subscriptionId: winningSub.id,
			updates: periodUpdates,
		});
	}
}
