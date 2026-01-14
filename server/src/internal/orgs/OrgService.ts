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
import type { DrizzleCli } from "@server/db/initDrizzle.js";
import RecaseError from "@server/utils/errorUtils.js";
import { addDays } from "date-fns";
import {
	and,
	eq,
	inArray,
	isNotNull,
	like,
	lt,
	notExists,
	or,
	sql,
} from "drizzle-orm";
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

	/**
	 * Create a new organization
	 */
	static async create({
		db,
		id,
		slug,
		name,
		createdBy,
	}: {
		db: DrizzleCli;
		id: string;
		slug: string;
		name: string;
		createdBy?: string;
	}): Promise<Organization> {
		const [insertedOrg] = await db
			.insert(organizations)
			.values({
				id,
				slug,
				name,
				logo: "",
				createdAt: new Date(),
				metadata: "",
				created_by: createdBy,
			})
			.returning();

		if (!insertedOrg) {
			throw new RecaseError({
				message: "Failed to create organization",
				code: ErrCode.InternalError,
				statusCode: 500,
			});
		}

		return insertedOrg as Organization;
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
		updates: Partial<Organization>;
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

	static async listPreviewOrgsForDeletion({ db }: { db: DrizzleCli }) {
		const PREVIEW_ORG_PATTERN = "preview|%";
		// 1. Find all preview orgs with no memberships
		const orgs = await db
			.select()
			.from(organizations)
			.where(
				and(
					// SAFETY: Only match preview org slug pattern
					like(organizations.slug, PREVIEW_ORG_PATTERN),
					// SAFETY: Only delete orgs with no members
					notExists(
						db
							.select({ id: member.id })
							.from(member)
							.where(eq(member.organizationId, organizations.id)),
					),
					// SAFETY: Only delete preview organizations older than 1 day
					lt(organizations.createdAt, addDays(new Date(), -1)),
					isNotNull(organizations.created_by),
				),
			);

		return orgs as Organization[];
	}
}
