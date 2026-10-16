/**
 * The atom_deployments repo against real Postgres and the real org cache.
 *
 * Contract:
 *  1. an env holds many Atoms: each is found by its id, all are listed oldest first, and a find naming none refuses to pick;
 *  2. a write only lands on the row as it was read: a stale copy cannot undo a move or forget a replacement;
 *  3. the cached org follows an Atom's route (status, endpoint, token) and ignores its deploy progress;
 *  4. a token hash names its Atom's org and env;
 *  5. the first check seen is written once, and neither a later sighting nor a refresh from a stale read clears it.
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
import { cacheDeploymentRepo } from "@/internal/byoc/repos/cacheDeploymentRepo.js";
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
	name: null,
	deployment_group_id: deploymentGroupId,
	deployment_id: null,
	status,
	endpoint_url: null,
	cpu: 4,
	memory: 8,
	encrypted_token: "encrypted",
	token_hash: crypto.randomUUID(),
	region: "us-east-1",
	volume_size_gib: 20,
	network: null,
	stack_name: null,
	stages: toCacheStages({ doneStages: [], status }),
	error: null,
	first_check_at: null,
	first_check_seen_at: null,
	created_at: Date.now(),
});

const cacheKey = buildOrgWithFeaturesCacheKey({ orgId, env: ctx.env });

const cachedRoutes = async () =>
	(await getOrgWithFeaturesCached({ db: ctx.db, orgId, env: ctx.env }))?.org
		.atomDeployments;

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

test(`${chalk.yellowBright("atom-rows1: an env holds two Atoms; each is found by id, and a find naming none refuses to pick")}`, async () => {
	const first = atomRow({ deploymentGroupId: `dg_${orgId}_a` });
	const second = {
		...atomRow({ deploymentGroupId: `dg_${orgId}_b` }),
		created_at: first.created_at + 1,
	};

	expect(
		await cacheDeploymentRepo.insert({ ctx, cacheDeployment: first }),
	).toBe(true);
	expect(await cacheDeploymentRepo.find({ ctx })).toEqual(first);
	expect(
		await cacheDeploymentRepo.insert({ ctx, cacheDeployment: second }),
	).toBe(true);

	expect(await cacheDeploymentRepo.findActive({ ctx })).toEqual([
		first,
		second,
	]);
	expect(await cacheDeploymentRepo.find({ ctx, atomId: second.id })).toEqual(
		second,
	);
	await expect(cacheDeploymentRepo.find({ ctx })).rejects.toThrow(
		"more than one Atom",
	);

	await cacheDeploymentRepo.delete({ ctx, cacheDeployment: first });
	expect(await cacheDeploymentRepo.find({ ctx })).toEqual(second);
	await cacheDeploymentRepo.delete({ ctx, cacheDeployment: second });
	expect(await cacheDeploymentRepo.find({ ctx })).toBeNull();
});

test(`${chalk.yellowBright("atom-rows2: a stale copy neither undoes a move nor forgets a replacement")}`, async () => {
	const original = atomRow({ deploymentGroupId: `dg_${orgId}_c` });
	const moved = { ...original, deployment_group_id: `dg_${orgId}_d` };
	await cacheDeploymentRepo.insert({ ctx, cacheDeployment: original });
	await cacheDeploymentRepo.update({ ctx, from: original, to: moved });

	// A refresh that read the row before the move lands nowhere.
	await cacheDeploymentRepo.update({
		ctx,
		from: original,
		to: { ...original, status: ByocCacheStatus.Failed },
	});
	expect(await cacheDeploymentRepo.find({ ctx })).toEqual(moved);

	// A replacement reuses the group but is a new row, so the old one's delete misses it.
	await cacheDeploymentRepo.delete({ ctx, cacheDeployment: moved });
	const replacement = atomRow({ deploymentGroupId: moved.deployment_group_id });
	await cacheDeploymentRepo.insert({ ctx, cacheDeployment: replacement });
	await cacheDeploymentRepo.delete({ ctx, cacheDeployment: moved });
	expect(await cacheDeploymentRepo.find({ ctx })).toEqual(replacement);

	await cacheDeploymentRepo.delete({ ctx, cacheDeployment: replacement });
});

test(`${chalk.yellowBright("atom-rows3: the cached org follows the Atom's route and ignores its deploy progress")}`, async () => {
	const provisioning = atomRow({
		deploymentGroupId: `dg_${orgId}_e`,
		status: ByocCacheStatus.Provisioning,
	});
	await cacheDeploymentRepo.insert({ ctx, cacheDeployment: provisioning });
	expect(await cachedRoutes()).toEqual([
		{
			id: provisioning.id,
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
	await cacheDeploymentRepo.update({ ctx, from: provisioning, to: progressed });
	expect(await getMiscRedis().exists(cacheKey)).toBe(1);

	const ready = {
		...progressed,
		status: ByocCacheStatus.Ready,
		deployment_id: "dep_1",
		endpoint_url: "https://atom.example.com",
	};
	await cacheDeploymentRepo.update({ ctx, from: progressed, to: ready });
	expect(await getMiscRedis().exists(cacheKey)).toBe(0);
	expect(await cachedRoutes()).toEqual([
		{
			id: provisioning.id,
			status: ByocCacheStatus.Ready,
			deployment_id: "dep_1",
			endpoint_url: "https://atom.example.com",
			encrypted_token: "encrypted",
		},
	]);

	await cacheDeploymentRepo.delete({ ctx, cacheDeployment: ready });
});

test(`${chalk.yellowBright("atom-rows4: a token hash names its Atom's org and env")}`, async () => {
	const atom = atomRow({ deploymentGroupId: `dg_${orgId}_f` });
	await cacheDeploymentRepo.insert({ ctx, cacheDeployment: atom });

	expect(
		await cacheDeploymentRepo.findByTokenHash({
			db: ctx.db,
			tokenHash: atom.token_hash ?? "",
		}),
	).toEqual({
		id: atom.id,
		orgId,
		env: AppEnv.Sandbox,
		encryptedToken: atom.encrypted_token,
	});
	expect(
		await cacheDeploymentRepo.findByTokenHash({
			db: ctx.db,
			tokenHash: "unknown",
		}),
	).toBeNull();

	await cacheDeploymentRepo.delete({ ctx, cacheDeployment: atom });
});

test(`${chalk.yellowBright("atom-rows5: the first check seen is written once, and no later write clears it")}`, async () => {
	const unseen = {
		...atomRow({
			deploymentGroupId: `dg_${orgId}_g`,
			status: ByocCacheStatus.Ready,
		}),
		deployment_id: "dep_1",
	};
	await cacheDeploymentRepo.insert({ ctx, cacheDeployment: unseen });

	await cacheDeploymentRepo.setFirstCheckSeenAt({
		ctx,
		cacheDeployment: unseen,
		firstCheckSeenAt: 1_000,
	});
	await cacheDeploymentRepo.setFirstCheckSeenAt({
		ctx,
		cacheDeployment: unseen,
		firstCheckSeenAt: 2_000,
	});
	expect((await cacheDeploymentRepo.find({ ctx }))?.first_check_seen_at).toBe(
		1_000,
	);

	// A refresh that read the row before the first check writes only what it changed.
	await cacheDeploymentRepo.update({
		ctx,
		from: unseen,
		to: { ...unseen, endpoint_url: "https://atom.example.com" },
	});
	expect(await cacheDeploymentRepo.find({ ctx })).toMatchObject({
		endpoint_url: "https://atom.example.com",
		first_check_seen_at: 1_000,
		first_check_at: null,
	});

	await cacheDeploymentRepo.delete({ ctx, cacheDeployment: unseen });
});
