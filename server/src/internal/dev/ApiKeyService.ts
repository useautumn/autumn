import {
	type ApiKey,
	type AppEnv,
	apiKeys,
	type Feature,
	features,
	type Organization,
	OrgConfigSchema,
} from "@autumn/shared";
import { and, desc, eq } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

export class ApiKeyService {
	static async verifyAndFetch({
		db,
		hashedKey,
		env,
	}: {
		db: DrizzleCli;
		hashedKey: string;
		env: AppEnv;
	}) {
		const data = await db.query.apiKeys.findFirst({
			where: eq(apiKeys.hashed_key, hashedKey),
			with: {
				org: {
					with: {
						features: {
							where: eq(features.env, env),
						},
						master: true,
					},
				},
			},
		});

		if (!data || !data.org) {
			console.warn(`verify secret key returned null`);
			return null;
		}

		const org = structuredClone(data.org) as Organization & {
			features?: Feature[];
		};

		delete org.features;

		org.config = OrgConfigSchema.parse(org.config || {});

		const result = {
			org,
			features: (data.org.features || []) as Feature[],
			env,
			userId: data.user_id,
		};

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
			limit: 200,
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
