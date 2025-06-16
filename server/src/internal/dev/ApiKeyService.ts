import { DrizzleCli } from "@/db/initDrizzle.js";
import { CacheType } from "@/external/caching/cacheActions.js";
import { CacheManager } from "@/external/caching/CacheManager.js";
import { getApiVersion } from "@/utils/versionUtils.js";

import {
  ApiKey,
  apiKeys,
  AppEnv,
  Feature,
  features,
  Organization,
  OrgConfigSchema,
} from "@autumn/shared";

import { desc, and, eq } from "drizzle-orm";

export class ApiKeyService {
  static async verifyAndFetch({
    db,
    secretKey,
    hashedKey,
    env,
  }: {
    db: DrizzleCli;
    secretKey: string;
    hashedKey: string;
    env: AppEnv;
  }) {
    let data = await db.query.apiKeys.findFirst({
      where: eq(apiKeys.hashed_key, hashedKey),
      with: {
        org: {
          with: {
            features: {
              where: eq(features.env, env),
            },
          },
        },
      },
    });

    if (!data || !data.org) {
      console.warn(`verify secret key ${secretKey} returned null`);
      return null;
    }

    let org = structuredClone(data.org) as Organization & {
      features?: Feature[];
    };

    delete org.features;

    org.config = OrgConfigSchema.parse(org.config || {});
    org.api_version = getApiVersion({
      createdAt: org.created_at!,
    });

    let result = {
      org,
      features: (data.org.features || []) as Feature[],
      env,
    };

    // console.log("result", result);
    return result;
  }

  static async getByOrg({
    db,
    orgId,
    env,
  }: {
    db: DrizzleCli;
    orgId: string;
    env: AppEnv;
  }) {
    return await db.query.apiKeys.findMany({
      where: and(eq(apiKeys.org_id, orgId), eq(apiKeys.env, env)),
      orderBy: [desc(apiKeys.id)],
    });
  }

  static async insert({ db, apiKey }: { db: DrizzleCli; apiKey: ApiKey }) {
    await db.insert(apiKeys).values(apiKey);
  }

  static async delete({
    db,
    id,
    orgId,
  }: {
    db: DrizzleCli;
    id: string;
    orgId: string;
  }) {
    return await db
      .delete(apiKeys)
      .where(and(eq(apiKeys.id, id), eq(apiKeys.org_id, orgId)))
      .returning();
  }
}

export class CachedKeyService {
  static async clearCache({ hashedKey }: { hashedKey: string }) {
    try {
      await CacheManager.invalidate({
        action: CacheType.SecretKey,
        value: hashedKey,
      });
    } catch (error) {
      console.error(
        `(warning) failed to clear cache for verify action: ${error}`,
      );
    }
  }
}
