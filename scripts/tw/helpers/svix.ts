// Svix files run on a separate pool with an application per worker.
// Normal workers never receive Svix credentials or application bindings.

import { AppEnv } from "@autumn/shared";
import {
	createSvixApp as serverCreateSvixApp,
	deleteSvixApp as serverDeleteSvixApp,
} from "@server/external/svix/svixHelpers.js";
import { createSvixCli } from "@server/external/svix/svixUtils.js";
import { TEST_ORG_CONFIG } from "../../setupTestUtils/createTestOrg.ts";
import { detectCapabilities } from "./testCapabilities.ts";

/** Whether a test file belongs on the Svix shard; detection lives in the capability registry. */
export const needsSvix = async (file: string): Promise<boolean> =>
	(await detectCapabilities(file)).includes("svix");

// Record each application before its worker boots so provisioning failures remain cleanable.
export const createSvixApp = async (orgId: string): Promise<string> => {
	if (!process.env.SVIX_API_KEY) {
		throw new Error(
			"[tw] SVIX_API_KEY is required to provision the dedicated svix shard's app — resolve it into the orchestrator env before `bun tw`",
		);
	}

	const app = await serverCreateSvixApp({
		name: `${TEST_ORG_CONFIG.slug}_${AppEnv.Sandbox}`,
		orgId,
		env: AppEnv.Sandbox,
	});

	if (!app?.id) {
		throw new Error(
			"[tw] createSvixApp returned no app id — cannot provision the svix shard",
		);
	}

	return app.id;
};

/**
 * Orphan sweep for the dedicated svix-shard app (plan §9a `kill --orphans`),
 * mirroring the Stripe sub-account + Vercel sandbox sweeps: deletes test Svix
 * apps left behind by runs that SIGKILLed before recording `entry.svixAppId`.
 *
 * IMPORTANT: unlike Stripe/Vercel orphans, Svix test apps carry NO per-owner
 * tag today — every run names its app `<slug>_<env>` and tags it
 * `{ org_id, env }` for the SHARED unit-test org. So we cannot scope by owner;
 * the AGE CUTOFF is the only thing preventing us from nuking an in-flight run's
 * app. Keep `olderThanMs` aligned with the other sweeps' cutoff.
 *
 * No-ops (returns 0) when `SVIX_API_KEY` is unset so non-Svix users never error.
 * Per-app delete failures are logged and skipped. Returns the count deleted.
 */
export const sweepOrphanSvixApps = async ({
	olderThanMs,
}: {
	olderThanMs: number;
}): Promise<number> => {
	if (!process.env.SVIX_API_KEY) {
		return 0;
	}

	const svix = createSvixCli();
	const cutoff = Date.now() - olderThanMs;

	// Collect every application across all pages first (paginate via the
	// `iterator`/`done` cursor the SDK returns), then delete the test orphans.
	const apps: Awaited<ReturnType<typeof svix.application.list>>["data"] = [];
	let iterator: string | null | undefined;
	do {
		const page = await svix.application.list({ iterator });
		apps.push(...page.data);
		iterator = page.iterator;
		if (page.done) {
			break;
		}
	} while (iterator);

	const orphans = apps.filter((app) => {
		const isTestApp =
			app.metadata?.org_id === TEST_ORG_CONFIG.id ||
			app.name.startsWith(`${TEST_ORG_CONFIG.slug}_`);
		return isTestApp && new Date(app.createdAt).getTime() < cutoff;
	});

	let deleted = 0;
	for (const app of orphans) {
		try {
			await serverDeleteSvixApp({ appId: app.id });
			deleted++;
		} catch (error) {
			console.warn(
				`[tw] failed to delete orphan svix app ${app.id}: ${(error as Error).message}`,
			);
		}
	}

	return deleted;
};
