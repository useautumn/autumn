import RecaseError from "@/utils/errorUtils.js";
import {
  AppEnv,
  ErrCode,
  Feature,
  features,
  Organization,
  OrgConfigSchema,
} from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";
import { getApiVersion } from "@/utils/versionUtils.js";
import { clearOrgCache } from "./orgUtils/clearOrgCache.js";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { eq } from "drizzle-orm";
import { organizations, apiKeys } from "@autumn/shared";

export class OrgService {
  static async getFromReq(req: any) {
    if (req.org) {
      let org = structuredClone(req.org);
      let config = org.config || {};
      let apiVersion = getApiVersion({
        createdAt: org.created_at,
      });
      return {
        ...org,
        config: OrgConfigSchema.parse(config),
        api_version: apiVersion,
      };
    }

    return await this.get({ db: req.db, orgId: req.orgId });
  }

  // Drizzle get
  static async get({ db, orgId }: { db: DrizzleCli; orgId: string }) {
    const result = await db.query.organizations.findFirst({
      where: eq(organizations.id, orgId),
    });

    if (!result) {
      throw new RecaseError({
        message: "Organization not found",
        code: ErrCode.OrgNotFound,
        statusCode: 404,
      });
    }

    return {
      ...result,
      config: OrgConfigSchema.parse(result.config || {}),
      api_version: getApiVersion({
        createdAt: result.created_at!,
      }),
    };
  }

  static async getWithKeys({
    db,
    orgId,
    env,
  }: {
    db: DrizzleCli;
    orgId: string;
    env?: AppEnv;
  }) {
    const result = await db.query.organizations.findFirst({
      where: eq(organizations.id, orgId),
      with: {
        api_keys: env ? { where: eq(apiKeys.env, env) } : true,
      },
    });

    if (!result) {
      return null;
    }

    return result;
  }

  static async getWithFeatures({
    db,
    orgId,
    env,
  }: {
    db: DrizzleCli;
    orgId: string;
    env: AppEnv;
  }) {
    const result = (await db.query.organizations.findFirst({
      where: eq(organizations.id, orgId),
      with: {
        features: {
          where: eq(features.env, env),
        },
      },
    })) as Organization & {
      features: Feature[];
    };

    if (!result) {
      throw new RecaseError({
        message: `Organization ${orgId} not found`,
        code: ErrCode.OrgNotFound,
        statusCode: 404,
      });
    }

    let org = structuredClone(result);
    delete (org as any).features;
    return { org, features: result.features || [] };
  }

  static async getFromPkeyWithFeatures({
    db,
    pkey,
    env,
  }: {
    db: DrizzleCli;
    pkey: string;
    env: AppEnv;
  }) {
    let org = await db.query.organizations.findFirst({
      where:
        env === AppEnv.Sandbox
          ? eq(organizations.test_pkey, pkey)
          : eq(organizations.live_pkey, pkey),
      with: {
        features: {
          where: eq(features.env, env),
        },
      },
    });

    return org as Organization & {
      features: Feature[];
    };
  }

  static async getBySlug({ db, slug }: { db: DrizzleCli; slug: string }) {
    const result = await db.query.organizations.findFirst({
      where: eq(organizations.slug, slug),
    });

    if (!result) {
      return null;
    }

    return result as Organization;
  }

  static async insert({ db, org }: { db: DrizzleCli; org: any }) {
    await db.insert(organizations).values(org);
  }

  static async delete({ db, orgId }: { db: DrizzleCli; orgId: string }) {
    await db.delete(organizations).where(eq(organizations.id, orgId));
  }

  static async update({
    db,
    orgId,
    updates,
  }: {
    db: DrizzleCli;
    orgId: string;
    updates: any;
  }) {
    try {
      let result = await db
        .update(organizations)
        .set(updates)
        .where(eq(organizations.id, orgId))
        .returning();

      await clearOrgCache({
        db,
        orgId,
      });

      return result.length > 0 ? result[0] : null;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }
}
