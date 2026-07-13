import type { AppEnv } from "@autumn/shared";
import { getFeatures } from "@tests/setup/v2Features.js";
import { ensureOrgSvixApps } from "@tests/utils/setup/ensureOrgSvixApps.js";
import axios from "axios";
import { initDrizzle } from "@/db/initDrizzle";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { OrgService } from "@/internal/orgs/OrgService.js";

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
		const v2Features = getFeatures({ orgId });
		await FeatureService.insert({
			db,
			data: Object.values(v2Features),
			logger: console,
		});
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
			},
		},
	});

	await ensureOrgSvixApps({ db, org });
};
