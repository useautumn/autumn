import RecaseError from "@/utils/errorUtils.js";
import { and, eq, sql, inArray } from "drizzle-orm";
import {
  AppEnv,
  ErrCode,
  Feature,
  features,
  invitation,
  member,
  Organization,
  OrgConfigSchema,
  user,
} from "@autumn/shared";

import { getApiVersion } from "@/utils/versionUtils.js";
import { clearOrgCache } from "./orgUtils/clearOrgCache.js";
import { organizations, apiKeys } from "@autumn/shared";
import { DrizzleCli } from "@/db/initDrizzle.js";

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

  static async getMembers({ db, orgId }: { db: DrizzleCli; orgId: string }) {
    const results = await db
      .select()
      .from(member)
      .where(eq(member.organizationId, orgId))
      .innerJoin(user, eq(member.userId, user.id));

    return results;

    // // Try to get members with user data
    // let results;
    // try {
    //   results = await db.query.member.findMany({
    //     where: eq(member.organizationId, orgId),
    //     with: {
    //       user: true,
    //     },
    //   });
    // } catch (error) {
    //   // Fallback: get members and users separately
    //   const members = await db.query.member.findMany({
    //     where: eq(member.organizationId, orgId),
    //   });

    //   const userIds = members.map((m) => m.userId);
    //   const users = await db.query.user.findMany({
    //     where: inArray(user.id, userIds),
    //   });

    //   // Combine the data
    //   results = members.map((member) => ({
    //     ...member,
    //     user: users.find((u) => u.id === member.userId),
    //   }));
    // }

    // // Transform to the expected format
    // const transformed = results
    //   .map((result) => {
    //     // Check if user data exists
    //     if (!result.user) {
    //       console.error("Missing user data for member:", result);
    //       return null;
    //     }

    //     return {
    //       member: {
    //         id: result.id,
    //         organizationId: result.organizationId,
    //         userId: result.userId,
    //         role: result.role,
    //         createdAt: result.createdAt,
    //       },
    //       user: {
    //         id: result.user.id,
    //         name: result.user.name,
    //         email: result.user.email,
    //         emailVerified: result.user.emailVerified,
    //         image: result.user.image,
    //         createdAt: result.user.createdAt,
    //         updatedAt: result.user.updatedAt,
    //         role: result.user.role,
    //         banned: result.user.banned,
    //         banReason: result.user.banReason,
    //         banExpires: result.user.banExpires,
    //         createdBy: result.user.createdBy,
    //       },
    //     };
    //   })
    //   .filter(Boolean); // Remove null entries

    // return transformed;
  }

  static async getInvites({ db, orgId }: { db: DrizzleCli; orgId: string }) {
    const results = await db.query.invitation.findMany({
      where: and(
        eq(invitation.organizationId, orgId),
        eq(invitation.status, "pending")
      ),
    });

    return results;
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
    allowNotFound = false,
  }: {
    db: DrizzleCli;
    orgId: string;
    env: AppEnv;
    allowNotFound?: boolean;
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
      if (allowNotFound) {
        return null;
      }

      throw new RecaseError({
        message: `Organization ${orgId} not found`,
        code: ErrCode.OrgNotFound,
        statusCode: 404,
      });
    }

    let org = structuredClone(result);
    delete (org as any).features;
    return {
      org: {
        ...org,
        api_version: getApiVersion({
          createdAt: org.created_at!,
        }),
        config: OrgConfigSchema.parse(org.config || {}),
      },
      features: result.features || [],
    };
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

  static async getCacheEnabledOrgs({ db }: { db: DrizzleCli }) {
    const result = await db.query.organizations.findMany({
      where: sql`${organizations.config}->>'cache_customer' = 'true'`,
    });

    return result;
  }
}
