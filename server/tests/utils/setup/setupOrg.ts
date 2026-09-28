import type { AppEnv } from "@autumn/shared";
import { getFeatures } from "@tests/setup/v2Features.js";
import { ensureOrgSvixApps } from "@tests/utils/setup/ensureOrgSvixApps.js";
import axios from "axios";
import { type DrizzleCli, initDrizzle } from "@/db/initDrizzle";
import { invalidateProductsCache } from "@/external/redis/actions/productsCache/productsCache.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { clearOrgCache } from "@/internal/orgs/orgUtils/clearOrgCache.js";

const featureConfigKey = (config: unknown) => JSON.stringify(config ?? null);

/** Insert missing TestFeatures and refresh stale credit-system configs. */
export const ensureV2Features = async ({
	db,
	orgId,
	env,
}: {
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
}) => {
	const wanted = Object.values(getFeatures({ orgId }));
	const existing = await FeatureService.list({ db, orgId, env });
	const existingById = new Map(existing.map((feature) => [feature.id, feature]));
	const missing = wanted.filter((feature) => !existingById.has(feature.id));
	if (missing.length > 0) {
		const inserted = await FeatureService.insert({
			db,
			data: missing,
			logger: console,
		});
		if (!inserted) {
			throw new Error(
				`ensureV2Features: insert failed for ${missing.map((feature) => feature.id).join(",")}`,
			);
		}
	}

	for (const feature of wanted) {
		const current = existingById.get(feature.id);
		if (!current) continue;
		if (featureConfigKey(current.config) === featureConfigKey(feature.config)) {
			continue;
		}
		await FeatureService.update({
			db,
			id: feature.id,
			orgId,
			env,
			updates: { config: feature.config, type: feature.type },
		});
	}

	// Config no-ops still leave org/product caches holding the previous join.
	await clearOrgCache({ db, orgId, env, logger: console });
	await invalidateProductsCache({ orgId, env });
};

export const getAxiosInstance = (apiKey?: string) => {
	// Priority: 1. Passed apiKey, 2. Org secret key from context, 3. TEST_ORG_SECRET_KEY fallback
	// Import ctx here to avoid circular dependency issues
	const ctx =
		require("@tests/utils/testInitUtils/createTestContext.js").default;
	const secretKey =
		apiKey || ctx?.orgSecretKey || process.env.TEST_ORG_SECRET_KEY;

	if (!secretKey) {
		throw new Error("No secret key found");
	}

	return axios.create({
		baseURL: process.env.AUTUMN_TEST_BASE_URL || "http://localhost:8080",
		headers: {
			Authorization: `Bearer ${secretKey}`,
			"x-api-version": "0.1",
		},
	});
};

export const setupOrg = async ({
	orgId,
	env,
	seedFeatures = true,
}: {
	orgId: string;
	env: AppEnv;
	seedFeatures?: boolean;
}) => {
	const { db } = initDrizzle();
	if (seedFeatures) {
		await ensureV2Features({ db, orgId, env });
		console.log("✅ Inserted v2 features");
	} else {
		console.log("↷ Skipped v2 feature seed");
	}

	// Update org config
	const org = await OrgService.get({ db, orgId });
	await OrgService.update({
		db,
		orgId,
		updates: {
			config: {
				...org.config,
				bill_upgrade_immediately: true,
				disable_stripe_writes: false,
			},
		},
	});

	await ensureOrgSvixApps({ db, org });
};
