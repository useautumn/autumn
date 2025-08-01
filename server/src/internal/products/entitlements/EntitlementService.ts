import { DrizzleCli } from "@/db/initDrizzle.js";
import {
  Entitlement,
  entitlements,
  features,
  EntitlementWithFeature,
} from "@autumn/shared";
import { eq, and, inArray } from "drizzle-orm";
import { buildConflictUpdateColumns } from "@/db/dbUtils.js";

export class EntitlementService {
  static async getByOrg({
    db,
    orgId,
    env,
    excludeCustom = true,
  }: {
    db: DrizzleCli;
    orgId: string;
    env: string;
    excludeCustom?: boolean;
  }) {
    // 1. get features for org
    let featuresQuery = db
      .select({
        internal_id: features.internal_id,
      })
      .from(features)
      .where(and(eq(features.org_id, orgId), eq(features.env, env)));

    let ents = await db.query.entitlements.findMany({
      where: (entitlements, { inArray }) =>
        and(
          inArray(entitlements.internal_feature_id, featuresQuery),
          excludeCustom ? eq(entitlements.is_custom, false) : undefined,
        ),
      with: {
        feature: true,
      },
    });

    return ents as EntitlementWithFeature[];
  }

  static async getByFeature({
    db,
    internalFeatureId,
  }: {
    db: DrizzleCli;
    internalFeatureId: string;
  }) {
    return await db.query.entitlements.findFirst({
      where: eq(entitlements.internal_feature_id, internalFeatureId),
      with: {
        feature: true,
      },
    });
  }

  static async insert({
    db,
    data,
  }: {
    db: DrizzleCli;
    data: Entitlement[] | Entitlement;
  }) {
    if (Array.isArray(data) && data.length == 0) {
      return;
    }

    return await db.insert(entitlements).values(data as any); // DRIZZLE TYPE REFACTOR
  }

  static async upsert({
    db,
    data,
  }: {
    db: DrizzleCli;
    data: Entitlement[] | Entitlement;
  }) {
    if (Array.isArray(data) && data.length == 0) return;

    const updateColumns = buildConflictUpdateColumns(entitlements, ["id"]);
    await db
      .insert(entitlements)
      .values(data as any)
      .onConflictDoUpdate({
        target: entitlements.id,
        set: updateColumns,
      });
  }

  static async update({
    db,
    id,
    updates,
  }: {
    db: DrizzleCli;
    id: string;
    updates: Partial<Entitlement>;
  }) {
    return await db
      .update(entitlements)
      .set(updates)
      .where(eq(entitlements.id, id));
  }

  static async deleteInIds({ db, ids }: { db: DrizzleCli; ids: string[] }) {
    await db.delete(entitlements).where(inArray(entitlements.id, ids));
  }
}
