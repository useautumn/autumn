import {
	AppEnv,
	apiKeys,
	ErrCode,
	type Feature,
	features,
	invitation,
	member,
	type Organization,
	OrgConfigSchema,
	organizations,
	user,
} from "@autumn/shared";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import RecaseError from "@/utils/errorUtils.js";
import { FeatureService } from "../features/FeatureService.js";
import { clearOrgCache } from "./orgUtils/clearOrgCache.js";

export class OrgService {
	static async getFromReq(req: any) {
		if (req.org) {
			const org = structuredClone(req.org);
			const config = org.config || {};
			return {
				...org,
				config: OrgConfigSchema.parse(config),
			};
		}

		return await OrgService.get({ db: req.db, orgId: req.orgId });
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
				eq(invitation.status, "pending"),
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
		} as Organization;
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
				master: true,
			},
		})) as Organization & {
			features?: Feature[];
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

		const org = structuredClone(result);
		delete org.features;

		return {
			org: {
				...org,
				config: OrgConfigSchema.parse(org.config || {}),
			},
			features: result.features || [],
		};
	}

	static async listWithFeatures({
		db,
		env,
		orgIds,
	}: {
		db: DrizzleCli;
		env: AppEnv;
		orgIds: string[];
	}) {
		const result = await db.query.organizations.findMany({
			where: inArray(organizations.id, orgIds),
			with: {
				features: {
					where: eq(features.env, env),
				},
				master: true,
			},
		});

		if (!result) {
			return [];
		}

		return result.map((r) => {
			const org = structuredClone(r);
			delete (org as any).features;

			return {
				org: {
					...org,
					config: OrgConfigSchema.parse(org.config || {}),
				},
				features: r.features || [],
			} as {
				org: Organization;
				features: Feature[];
			};
		});
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
		const org = await db.query.organizations.findFirst({
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
			const result = await db
				.update(organizations)
				.set(updates)
				.where(eq(organizations.id, orgId))
				.returning();

			await clearOrgCache({
				db,
				orgId,
			});

			return result.length > 0 ? (result[0] as Organization) : null;
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

	static async getByAccountId({
		db,
		accountId,
	}: {
		db: DrizzleCli;
		accountId: string;
	}) {
		const result = await db.query.organizations.findFirst({
			where: or(
				eq(
					sql`${organizations.test_stripe_connect}->>'default_account_id'`,
					accountId,
				),
				eq(sql`${organizations.test_stripe_connect}->>'account_id'`, accountId),
				eq(sql`${organizations.live_stripe_connect}->>'account_id'`, accountId),
			),
			with: {
				master: true,
			},
		});

		if (!result) {
			throw new RecaseError({
				message: "Organization not found",
				code: ErrCode.OrgNotFound,
				statusCode: 404,
			});
		}

		const defaultAccountId = result?.test_stripe_connect?.default_account_id;
		const testAccountId = result?.test_stripe_connect?.account_id;

		const env =
			defaultAccountId === accountId || testAccountId === accountId
				? AppEnv.Sandbox
				: AppEnv.Live;

		const features = await FeatureService.list({
			db,
			orgId: result?.id || "",
			env,
		});

		return {
			features,
			org: {
				...(result as Organization),
				config: OrgConfigSchema.parse(result.config || {}),
			},
			env,
		};
	}

	static async findByStripeAccountId({
		db,
		accountId,
		env,
	}: {
		db: DrizzleCli;
		accountId: string;
		env: AppEnv;
	}): Promise<Organization | undefined> {
		const result = await db.query.organizations.findFirst({
			where: or(
				eq(sql`${organizations.test_stripe_connect}->>'account_id'`, accountId),
				eq(sql`${organizations.live_stripe_connect}->>'account_id'`, accountId),
			),
		});

		return result as Organization;
	}

	/**
	 * Update Stripe Connect account ID for an organization
	 */
	static async updateStripeConnect({
		db,
		orgId,
		accountId,
		env,
	}: {
		db: DrizzleCli;
		orgId: string;
		accountId: string;
		env: AppEnv;
	}): Promise<void> {
		const [org] = await db
			.select()
			.from(organizations)
			.where(eq(organizations.id, orgId))
			.limit(1);

		if (!org) {
			throw new RecaseError({
				message: "Organization not found",
				code: ErrCode.OrgNotFound,
				statusCode: 404,
			});
		}

		if (env === AppEnv.Sandbox) {
			const currentConnect = org.test_stripe_connect || {};
			await db
				.update(organizations)
				.set({
					test_stripe_connect: {
						...currentConnect,
						account_id: accountId,
					},
				})
				.where(eq(organizations.id, orgId));
		} else {
			const currentConnect = org.live_stripe_connect || {};
			await db
				.update(organizations)
				.set({
					live_stripe_connect: {
						...currentConnect,
						account_id: accountId,
					},
				})
				.where(eq(organizations.id, orgId));
		}

		await clearOrgCache({ db, orgId });
	}

	static async updateConnectWebhookSecret({
		db,
		orgId,
		env,
		secret,
	}: {
		db: DrizzleCli;
		orgId: string;
		env: AppEnv;
		secret: string;
	}) {
		const prefix = env === AppEnv.Sandbox ? "test" : "live";
		const org = await OrgService.get({ db, orgId });
		console.info(`Updating connect webhook secret for ${env} org ${orgId}`);
		console.info(`Secret: ${secret}`);
		await db
			.update(organizations)
			.set({
				stripe_config: {
					...(org.stripe_config || {}),
					[`${prefix}_connect_webhook_secret`]: secret,
				},
			})
			.where(eq(organizations.id, orgId));

		await clearOrgCache({ db, orgId });
	}
}
