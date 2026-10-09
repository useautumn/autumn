/**
 * The atom_deployments repo against real Postgres and the real org cache.
 *
 * Contract:
 *  1. one Atom per org and env: a second claim loses and the first is read back;
 *  2. a write only lands on the row as it was read: a stale copy cannot undo a move or forget a replacement;
 *  3. the cached org follows an Atom's route (status, endpoint, token) and ignores its deploy progress;
 *  4. a token hash names its Atom's org and env.
 */

import { afterAll, beforeAll, expect, test } from "bun:test";
import { buildOrgWithFeaturesCacheKey } from "@autumn/cache";
import {
	AppEnv,
	type ByocCacheDeployment,
	ByocCacheStage,
	ByocCacheStatus,
	organizations,
} from "@autumn/shared";
import defaultCtx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import { getMiscRedis } from "@/external/redis/initRedis.js";
import {
	deleteCacheDeployment,
	findCacheByTokenHash,
	findCacheDeployment,
	insertCacheDeployment,
	updateCacheDeployment,
} from "@/internal/byoc/repos/cacheDeployments.js";
import { toCacheStages } from "@/internal/byoc/utils/cacheStageUtils.js";
import { getOrgWithFeaturesCached } from "@/internal/orgs/orgUtils/getOrgWithFeaturesCached.js";
import { generateId } from "@/utils/genUtils.js";

// A throwaway org, so these rows never meet the test org's own Atom in atom-deployment.test.ts.
const orgId = `org_atom_rows_${crypto.randomUUID()}`;
const ctx = {
	...defaultCtx,
	org: { ...defaultCtx.org, id: orgId },
	env: AppEnv.Sandbox,
};

const atomRow = ({
	deploymentGroupId,
	status = ByocCacheStatus.AwaitingSetup,
}: {
	deploymentGroupId: string;
	status?: ByocCacheStatus;
}): ByocCacheDeployment => ({
	id: generateId("atom"),
	org_id: orgId,
	env: AppEnv.Sandbox,
	deployment_group_id: deploymentGroupId,
	deployment_id: null,
	status,
	endpoint_url: null,
	cpu: 2,
	memory: 1,
	encrypted_token: "encrypted",
	token_hash: crypto.randomUUID(),
	region: "us-east-1",
	network: null,
	stack_name: null,
	stages: toCacheStages({ doneStages: [], status }),
	error: null,
	first_check_at: null,
	created_at: Date.now(),
});

const cacheKey = buildOrgWithFeaturesCacheKey({ orgId, env: ctx.env });

const cachedRoutes = async () =>
	(await getOrgWithFeaturesCached({ db: ctx.db, orgId, env: ctx.env }))
		?.atomDeployments;

beforeAll(async () => {
	await ctx.db.insert(organizations).values({
		id: orgId,
		slug: orgId,
		name: "Atom rows org",
		logo: "",
		createdAt: new Date(),
		metadata: "",
	});
});

afterAll(async () => {
	await ctx.db.delete(organizations).where(eq(organizations.id, orgId));
});

test(`${chalk.yellowBright("atom-rows1: a second claim for the env loses, and the first is read back")}`, async () => {
	const first = atomRow({ deploymentGroupId: `dg_${orgId}_a` });
	const second = atomRow({ deploymentGroupId: `dg_${orgId}_b` });

	expect(await insertCacheDeployment({ ctx, cacheDeployment: first })).toBe(
		true,
	);
	expect(await insertCacheDeployment({ ctx, cacheDeployment: second })).toBe(
		false,
	);
	expect(await findCacheDeployment({ ctx })).toEqual(first);

	await deleteCacheDeployment({ ctx, cacheDeployment: first });
	expect(await findCacheDeployment({ ctx })).toBeNull();
});

test(`${chalk.yellowBright("atom-rows2: a stale copy neither undoes a move nor forgets a replacement")}`, async () => {
	const original = atomRow({ deploymentGroupId: `dg_${orgId}_c` });
	const moved = { ...original, deployment_group_id: `dg_${orgId}_d` };
	await insertCacheDeployment({ ctx, cacheDeployment: original });
	await updateCacheDeployment({ ctx, from: original, to: moved });

	// A refresh that read the row before the move lands nowhere.
	await updateCacheDeployment({
		ctx,
		from: original,
		to: { ...original, status: ByocCacheStatus.Failed },
	});
	expect(await findCacheDeployment({ ctx })).toEqual(moved);

	// A replacement reuses the group but is a new row, so the old one's delete misses it.
	await deleteCacheDeployment({ ctx, cacheDeployment: moved });
	const replacement = atomRow({ deploymentGroupId: moved.deployment_group_id });
	await insertCacheDeployment({ ctx, cacheDeployment: replacement });
	await deleteCacheDeployment({ ctx, cacheDeployment: moved });
	expect(await findCacheDeployment({ ctx })).toEqual(replacement);

	await deleteCacheDeployment({ ctx, cacheDeployment: replacement });
});

test(`${chalk.yellowBright("atom-rows3: the cached org follows the Atom's route and ignores its deploy progress")}`, async () => {
	const provisioning = atomRow({
		deploymentGroupId: `dg_${orgId}_e`,
		status: ByocCacheStatus.Provisioning,
	});
	await insertCacheDeployment({ ctx, cacheDeployment: provisioning });
	expect(await cachedRoutes()).toEqual([
		{
			status: ByocCacheStatus.Provisioning,
			deployment_id: null,
			endpoint_url: null,
			encrypted_token: "encrypted",
		},
	]);

	const progressed = {
		...provisioning,
		stages: toCacheStages({
			doneStages: [ByocCacheStage.Stack],
			status: ByocCacheStatus.Provisioning,
		}),
	};
	await updateCacheDeployment({ ctx, from: provisioning, to: progressed });
	expect(await getMiscRedis().exists(cacheKey)).toBe(1);

	const ready = {
		...progressed,
		status: ByocCacheStatus.Ready,
		deployment_id: "dep_1",
		endpoint_url: "https://atom.example.com",
	};
	await updateCacheDeployment({ ctx, from: progressed, to: ready });
	expect(await getMiscRedis().exists(cacheKey)).toBe(0);
	expect(await cachedRoutes()).toEqual([
		{
			status: ByocCacheStatus.Ready,
			deployment_id: "dep_1",
			endpoint_url: "https://atom.example.com",
			encrypted_token: "encrypted",
		},
	]);

	await deleteCacheDeployment({ ctx, cacheDeployment: ready });
});

test(`${chalk.yellowBright("atom-rows4: a token hash names its Atom's org and env")}`, async () => {
	const atom = atomRow({ deploymentGroupId: `dg_${orgId}_f` });
	await insertCacheDeployment({ ctx, cacheDeployment: atom });

	expect(
		await findCacheByTokenHash({
			db: ctx.db,
			tokenHash: atom.token_hash ?? "",
		}),
	).toEqual({ orgId, env: AppEnv.Sandbox });
	expect(
		await findCacheByTokenHash({ db: ctx.db, tokenHash: "unknown" }),
	).toBeNull();

	await deleteCacheDeployment({ ctx, cacheDeployment: atom });
});
