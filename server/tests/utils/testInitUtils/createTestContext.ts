import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);

import {
	ApiVersionClass,
	AppEnv,
	AuthType,
	type Feature,
	LATEST_VERSION,
	type Organization,
} from "@autumn/shared";
import type Stripe from "stripe";
import { type DrizzleCli, initDrizzle } from "@/db/initDrizzle.js";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { resolveRedisV2 } from "@/external/redis/resolveRedisV2.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import {
	type Logger,
	logger,
} from "../../../src/external/logtail/logtailUtils.js";
import type { AutumnContext } from "../../../src/honoUtils/HonoEnv.js";
import { generateId } from "../../../src/utils/genUtils.js";

const DEFAULT_ENV = AppEnv.Sandbox;

export interface TestContext extends AutumnContext {
	org: Organization;
	env: AppEnv;
	stripeCli: Stripe;
	db: DrizzleCli;
	orgSecretKey: string;
	features: Feature[];
	logger: Logger;
}

export const createTestContext = async () => {
	const { db } = initDrizzle();

	// TESTS_ORG is set by the test runner (per parallel group).
	const orgSlug = process.env.TESTS_ORG;
	if (!orgSlug) {
		throw new Error(
			"TESTS_ORG environment variable is required (set by test runner)",
		);
	}

	const org = await OrgService.getBySlug({ db, slug: orgSlug });
	if (!org) {
		throw new Error(`Org with slug "${orgSlug}" not found`);
	}

	const env = DEFAULT_ENV;
	const stripeCli = createStripeCli({ org, env });
	const features = await FeatureService.list({ db, orgId: org.id, env });

	// Org secret key, set by test runner.
	const orgSecretKey = process.env.UNIT_TEST_AUTUMN_SECRET_KEY || "";
	if (!orgSecretKey) {
		throw new Error(
			`No secret key found for org "${orgSlug}" in environment "${env}". ` +
				`Make sure UNIT_TEST_AUTUMN_SECRET_KEY is set or org has secret_keys.${env}`,
		);
	}

	return {
		org,
		env,
		stripeCli,
		db,
		dbGeneral: db,
		features,
		logger,
		redisV2: resolveRedisV2(),
		orgSecretKey,

		id: generateId("test"),
		isPublic: false,
		authType: AuthType.Unknown,
		apiVersion: new ApiVersionClass(LATEST_VERSION),
		timestamp: Date.now(),
		scopes: [],
		skipCache: false,
		expand: [],
		extraLogs: {},
	} satisfies TestContext;
};

/**
 * Lazy default export. The real TestContext is built once by the preload
 * (`setup-integration-tests.ts`) and stashed on `globalThis`. The Proxy
 * defers the lookup until first property access, sidestepping the
 * import-order race (preload imports this module before populating the
 * stash) and the top-level-await TDZ from a prior implementation.
 *
 * Unit tests that hit this throw a clear "preload did not run" error.
 */
const lazyDefaultCtx = new Proxy({} as TestContext, {
	get(_target, prop, _receiver) {
		const ctx = (globalThis as { __autumnTestContext?: TestContext | null })
			.__autumnTestContext;
		if (ctx == null) {
			throw new Error(
				`Default TestContext is not initialized. The integration test ` +
					`preload (server/tests/setup-integration-tests.ts) did not ` +
					`populate globalThis.__autumnTestContext before "${String(prop)}" ` +
					`was accessed. This usually means a unit test is reaching for ` +
					`the default ctx, or the preload was bypassed.`,
			);
		}
		return Reflect.get(ctx, prop);
	},
	has(_target, prop) {
		const ctx = (globalThis as { __autumnTestContext?: TestContext | null })
			.__autumnTestContext;
		return ctx != null && prop in ctx;
	},
	ownKeys(_target) {
		const ctx = (globalThis as { __autumnTestContext?: TestContext | null })
			.__autumnTestContext;
		return ctx == null ? [] : Reflect.ownKeys(ctx);
	},
	getOwnPropertyDescriptor(_target, prop) {
		const ctx = (globalThis as { __autumnTestContext?: TestContext | null })
			.__autumnTestContext;
		if (ctx == null) return undefined;
		return Reflect.getOwnPropertyDescriptor(ctx, prop);
	},
});

export default lazyDefaultCtx;
