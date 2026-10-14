import { AppEnv } from "@autumn/shared";
import {
	createSvixApp as serverCreateSvixApp,
	deleteSvixApp as serverDeleteSvixApp,
} from "@server/external/svix/svixHelpers.js";
import { createSvixCli } from "@server/external/svix/svixUtils.js";
import { TEST_ORG_CONFIG } from "../../setupTestUtils/createTestOrg.ts";
import { detectCapabilities } from "./testCapabilities.ts";

export const needsSvix = async (file: string): Promise<boolean> =>
	(await detectCapabilities(file)).includes("svix");

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
