import { AppEnv, ErrCode, Subscription, subscriptions } from "@autumn/shared";
import { generateId } from "@/utils/genUtils.js";
import Stripe from "stripe";
import { DrizzleCli } from "@/db/initDrizzle.js";
import RecaseError from "@/utils/errorUtils.js";
import { and, eq, inArray } from "drizzle-orm";
import { subToPeriodStartEnd } from "@/external/stripe/stripeSubUtils/convertSubUtils.js";

export class SubService {
  static async createSub({ db, sub }: { db: DrizzleCli; sub: Subscription }) {
    let data = await db.insert(subscriptions).values(sub).returning();

    if (data.length === 0) {
      throw new RecaseError({
        code: ErrCode.InsertSubscriptionFailed,
        message: "Failed to create subscription",
        statusCode: 500,
      });
    }

    return data[0] as Subscription;
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

    let data = await db
      .select()
      .from(subscriptions)
      .where(
        and(
          stripeId ? eq(subscriptions.stripe_id, stripeId) : undefined,
          scheduleId
            ? eq(subscriptions.stripe_schedule_id, scheduleId)
            : undefined
        )
      );

    if (data.length == 0) {
      return await SubService.createSub({
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
        },
      });
    }

    let curSub = data[0];
    let updateResult = await db
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

  static async updateFromStripe({
    db,
    stripeSub,
  }: {
    db: DrizzleCli;
    stripeSub: Stripe.Subscription;
  }) {
    const { start, end } = subToPeriodStartEnd({ sub: stripeSub });
    let results = await db
      .update(subscriptions)
      .set({
        current_period_start: start,
        current_period_end: end,
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
    let data = await db
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
    let results = await db
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
}
