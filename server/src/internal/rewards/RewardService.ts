import { AppEnv, ErrCode, Reward, rewards } from "@autumn/shared";
import { DrizzleCli } from "@/db/initDrizzle.js";
import RecaseError from "@/utils/errorUtils.js";
import { and, arrayContains, desc, eq, inArray, or, sql } from "drizzle-orm";

export class RewardService {
  static async get({
    db,
    idOrInternalId,
    orgId,
    env,
  }: {
    db: DrizzleCli;
    idOrInternalId: string;
    orgId: string;
    env: AppEnv;
  }) {
    let result = await db.query.rewards.findFirst({
      where: and(
        or(
          eq(rewards.id, idOrInternalId),
          eq(rewards.internal_id, idOrInternalId)
        ),
        eq(rewards.org_id, orgId),
        eq(rewards.env, env)
      ),
    });

    if (!result) {
      return null;
    }

    return result as Reward;
  }

  static async getByIdOrCode({
    db,
    idOrCode,
    orgId,
    env,
  }: {
    db: DrizzleCli;
    idOrCode: string;
    orgId: string;
    env: AppEnv;
  }) {
    let reward = await db.query.rewards.findFirst({
      where: and(
        eq(rewards.org_id, orgId),
        eq(rewards.env, env),
        or(
          eq(rewards.id, idOrCode),
          sql`EXISTS (
            SELECT 1 FROM unnest("promo_codes") AS elem
            WHERE elem->>'code' = ${idOrCode}
          )`
        )
      ),
    });

    if (!reward) {
      return null;
    }

    return reward as Reward;
  }

  static async insert({
    db,
    data,
  }: {
    db: DrizzleCli;
    data: Reward | Reward[];
  }) {
    let results = await db.insert(rewards).values(data as Reward);
    return results as Reward[];
  }

  static async list({
    db,
    orgId,
    env,
  }: {
    db: DrizzleCli;
    orgId: string;
    env: AppEnv;
  }) {
    let results = await db.query.rewards.findMany({
      where: and(eq(rewards.org_id, orgId), eq(rewards.env, env)),
      orderBy: [desc(rewards.internal_id)],
    });

    return results as Reward[];
  }

  static async delete({
    db,
    internalId,
    env,
    orgId,
  }: {
    db: DrizzleCli;
    internalId: string;
    env: AppEnv;
    orgId: string;
  }) {
    await db
      .delete(rewards)
      .where(
        and(
          eq(rewards.internal_id, internalId),
          eq(rewards.env, env),
          eq(rewards.org_id, orgId)
        )
      );
  }

  static async update({
    db,
    internalId,
    env,
    orgId,
    update,
  }: {
    db: DrizzleCli;
    internalId: string;
    env: AppEnv;
    orgId: string;
    update: Partial<Reward>;
  }) {
    let result = await db
      .update(rewards)
      .set(update)
      .where(
        and(
          eq(rewards.internal_id, internalId),
          eq(rewards.env, env),
          eq(rewards.org_id, orgId)
        )
      )
      .returning();

    if (result.length === 0) {
      throw new RecaseError({
        message: `Reward ${internalId} not found`,
        code: ErrCode.InvalidRequest,
      });
    }

    return result[0] as Reward;
  }

  static async deleteByOrgId({
    db,
    orgId,
    env,
  }: {
    db: DrizzleCli;
    orgId: string;
    env: AppEnv;
  }) {
    await db
      .delete(rewards)
      .where(and(eq(rewards.org_id, orgId), eq(rewards.env, env)));
  }
}
