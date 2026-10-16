import { afterAll, beforeEach, expect, spyOn, test } from "bun:test";
import type { AlienClient, AlienDeployment } from "@autumn/alien";
import { type ShadowAtomConfig, shadowAtomConfig } from "@autumn/edge-config";
import { ByocCacheStatus, RecaseError, Scopes } from "@autumn/shared";
import { Hono } from "hono";
import { z } from "zod/v4";
import * as alienClientModule from "@/external/alien/getAlienClient.js";
import * as lockModule from "@/external/redis/utils/lockUtils/withLock.js";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import * as atomMetricsModule from "@/internal/byoc/actions/telemetry/atomLogs/queryAtomMetrics.js";
import { atomTokenToHash } from "@/internal/byoc/utils/atomTokenUtils.js";
import { toCacheStages } from "@/internal/byoc/utils/cacheStageUtils.js";
import { shadowAtomConfigStore } from "@/internal/misc/shadowAtom/shadowAtomConfigStore.js";
import { shadowAtomRpcRouter } from "@/internal/misc/shadowAtom/shadowAtomRouter.js";
import { shadowAtomStorage } from "@/internal/misc/shadowAtom/shadowAtomStorage.js";

const SHADOW_EXTERNAL_ID = /^autumn-internal-shadow-atom\.atom_[0-9a-f]{24}$/;
const SHADOW_STACK_NAME = /^atom-shadow-[0-9a-f]{6}$/;

import { decryptData } from "@/utils/encryptUtils.js";

const ENDPOINT = "https://shadow-atom.example.com";

const runningDeployment: AlienDeployment = {
	id: "dep_1",
	status: "running",
	stackState: {
		resources: {
			atom: { outputs: { publicEndpoints: { api: { url: ENDPOINT } } } },
		},
	},
	stackSettings: {
		compute: { pools: { stateful: { machine: "c8g.large" } } },
	},
};

const calls = {
	started: [] as Parameters<AlienClient["startSetup"]>[0][],
	resized: [] as Parameters<AlienClient["updateDeploymentCompute"]>[0][],
	deleted: [] as Parameters<AlienClient["deleteDeployment"]>[0][],
	found: [] as Parameters<AlienClient["findDeployment"]>[0][],
};
let deployment: AlienDeployment | null = null;
/** A group's own deployment where a test sets one; any other group finds `deployment`. */
let deploymentsByGroup: Record<string, AlienDeployment | null> = {};
let setupCount = 0;
/** External ids alien still has a deployment group for, whether or not a record names it. */
let liveGroups = new Set<string>();

const alienClient: AlienClient = {
	startSetup: async (params) => {
		calls.started.push(params);
		return {
			deploymentGroupId: `dg_${++setupCount}`,
			setupUrl: "https://setup.example",
		};
	},
	findDeploymentGroup: async ({ externalId }) =>
		liveGroups.has(externalId) ? { id: `dg_${externalId}` } : null,
	findDeployment: async (params) => {
		calls.found.push(params);
		return Object.hasOwn(deploymentsByGroup, params.deploymentGroupId)
			? deploymentsByGroup[params.deploymentGroupId]
			: deployment;
	},
	getDeployment: async () => deployment,
	retryDeployment: async () => {},
	updateDeploymentCompute: async (params) => {
		calls.resized.push(params);
	},
	deleteDeployment: async (params) => {
		calls.deleted.push(params);
	},
	revokeSetupLinksOnceDeleted: async () => {},
};

const configWith = (patch: Partial<ShadowAtomConfig>): ShadowAtomConfig => ({
	...shadowAtomConfig.defaultValue(),
	...patch,
});

const previousPassword = process.env.ENCRYPTION_PASSWORD;
process.env.ENCRYPTION_PASSWORD = "shadow-atom-test-password";

/** The file as the server last wrote it; every read starts from it. */
let stored = shadowAtomConfig.defaultValue();
const getAlien = spyOn(alienClientModule, "getAlienClient").mockReturnValue(
	alienClient,
);
// Locks are Redis's to prove; here they only run what they guard.
const lock = spyOn(lockModule, "withLock").mockImplementation(({ fn }) => fn());
const write = spyOn(shadowAtomConfigStore, "writeToSource").mockImplementation(
	async ({ config }) => {
		stored = structuredClone(config);
	},
);
const read = spyOn(shadowAtomConfigStore, "readFromSource").mockImplementation(
	async () => structuredClone(stored),
);
const metrics = spyOn(atomMetricsModule, "queryAtomMetrics").mockResolvedValue({
	period_seconds: 10,
	points: [],
	latest: null,
	volumes: [],
});

beforeEach(() => {
	stored = shadowAtomConfig.defaultValue();
	deployment = null;
	deploymentsByGroup = {};
	liveGroups = new Set();
	setupCount = 0;
	getAlien.mockReturnValue(alienClient);
	for (const list of Object.values(calls)) list.length = 0;
	write.mockClear();
	metrics.mockClear();
});
afterAll(() => {
	for (const spy of [lock, getAlien, write, read, metrics]) spy.mockRestore();
	process.env.ENCRYPTION_PASSWORD = previousPassword;
});

const createApp = ({ scopes }: { scopes: string[] }) => {
	const app = new Hono<HonoEnv>();
	app.use("*", async (c, next) => {
		c.set("ctx", { scopes } as HonoEnv["Variables"]["ctx"]);
		await next();
	});
	app.onError(
		(error) =>
			new Response(error.message, {
				status:
					error instanceof RecaseError
						? error.statusCode
						: error instanceof z.ZodError
							? 400
							: 500,
			}),
	);
	app.route("/admin/shadow-atom", shadowAtomRpcRouter);
	return app;
};

const call = ({
	route,
	body = {},
	scopes = [Scopes.Superuser],
}: {
	route: string;
	body?: unknown;
	scopes?: string[];
}) =>
	createApp({ scopes }).request(`/admin/shadow-atom/byoc.${route}`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});

const getAtom = async () => (await call({ route: "get_atom" })).json();

/** A shadow Atom alien has started, as the file holds it once its first read landed. */
const startedConfig = async () => {
	await call({ route: "create_atom", body: { cpu: 4, memory: 8 } });
	write.mockClear();
	calls.started.length = 0;
};

test("staff start the shadow Atom multi-tenant on the customer's alien stack, under an admin token only its hash leaves", async () => {
	const response = await call({
		route: "create_atom",
		body: { cpu: 4, memory: 8 },
	});

	expect(response.status).toBe(200);
	const body = await response.json();
	expect(body).toMatchObject({
		status: "awaiting_setup",
		cpu: 4,
		memory: 8,
		setup_url: "https://setup.example",
	});
	expect(body.token).toBeUndefined();
	const [started] = calls.started;
	expect(started?.externalId).toMatch(SHADOW_EXTERNAL_ID);
	expect(started?.label).toMatch(SHADOW_STACK_NAME);
	expect(body.stack_name).toBe(started?.label);
	expect(started?.pools).toEqual({
		stateful: { machine: "c8g.xlarge", machines: 2 },
	});
	expect(started?.containers).toEqual({
		atom: { cpu: 3, memory: "6Gi", volumeSizeGib: 20 },
	});
	const variables = Object.fromEntries(
		(started?.environmentVariables ?? []).map(({ name, value }) => [
			name,
			value,
		]),
	);
	const adminToken = decryptData(stored.adminEncryptedToken ?? "");
	expect(variables).toMatchObject({
		ATOM_MODE: "multi_tenant",
		ATOM_TOKEN_HASH: atomTokenToHash({ token: adminToken }),
	});
	expect(stored.deploymentGroupId).toBe("dg_1");
	expect(stored.externalId).toBe(started?.externalId ?? "");
	expect(stored.deployment).toMatchObject({ status: "awaiting_setup" });
});

test("starting again while the setup waits keeps the admin token; once past setup it returns the Atom untouched", async () => {
	await startedConfig();
	const token = decryptData(stored.adminEncryptedToken ?? "");

	await call({ route: "create_atom", body: { cpu: 4, memory: 8 } });
	expect(decryptData(stored.adminEncryptedToken ?? "")).toBe(token);
	expect(calls.started).toHaveLength(1);

	deployment = runningDeployment;
	await getAtom();
	calls.started.length = 0;
	const response = await call({
		route: "create_atom",
		body: { cpu: 4, memory: 8 },
	});
	expect(await response.json()).toMatchObject({
		status: "ready",
		setup_url: null,
	});
	expect(calls.started).toHaveLength(0);
});

test("a shadow Atom can run in an existing VPC, private to it, as an org's can", async () => {
	const response = await call({
		route: "create_atom",
		body: {
			cpu: 8,
			memory: 16,
			network: {
				type: "existing_vpc",
				vpc_id: "vpc-1",
				subnet_ids: ["subnet-a", "subnet-b"],
			},
		},
	});

	expect(response.status).toBe(200);
	expect(calls.started[0]?.network).toEqual({
		type: "byo-vpc-aws",
		vpc_id: "vpc-1",
		private_subnet_ids: ["subnet-a", "subnet-b"],
		public_subnet_ids: [],
	});
	expect((await getAtom()).cache).toMatchObject({
		network: {
			type: "existing_vpc",
			vpc_id: "vpc-1",
			subnet_ids: ["subnet-a", "subnet-b"],
		},
	});
});

test("without a network the shadow Atom gets a new VPC, as before", async () => {
	await call({ route: "create_atom", body: { cpu: 4, memory: 8 } });

	expect(calls.started[0]?.network).toBeNull();
});

test("a machine that is not offered is refused before alien is called", async () => {
	const response = await call({
		route: "create_atom",
		body: { cpu: 3, memory: 3 },
	});

	expect(response.status).toBe(400);
	expect(calls.started).toHaveLength(0);
	expect(write).not.toHaveBeenCalled();
});

test("with nothing deployed, staff read no Atom and alien is never asked", async () => {
	expect(await getAtom()).toMatchObject({ cache: null, removing: [] });
	expect(calls.found).toHaveLength(0);
});

test("a running deployment reads as an org's ready Atom, and its endpoint lands where herald routes, once", async () => {
	await startedConfig();
	deployment = runningDeployment;

	const { cache } = await getAtom();

	expect(cache).toMatchObject({
		status: "ready",
		deployment_id: "dep_1",
		endpoint_url: ENDPOINT,
		cpu: 2,
		memory: 4,
		stages: { stack: "done", atom: "done", connected: "running" },
	});
	expect(stored.endpointUrl).toBe(ENDPOINT);

	write.mockClear();
	await getAtom();
	expect(write).not.toHaveBeenCalled();
});

test("a file from before the record was kept follows its group like any other, and keeps the record from then on", async () => {
	stored = configWith({ deploymentGroupId: "dg_1" });
	expect((await getAtom()).cache).toMatchObject({ status: "awaiting_setup" });

	deployment = runningDeployment;
	const { cache } = await getAtom();

	expect(cache).toMatchObject({ status: "ready", deployment_id: "dep_1" });
	expect(stored.deployment).toMatchObject({ status: "ready" });
});

test("resize moves the running Atom's pool; one still awaiting setup, or none, is a 409", async () => {
	expect(
		(await call({ route: "resize_atom", body: { cpu: 2, memory: 4 } })).status,
	).toBe(409);
	await startedConfig();
	expect(
		(await call({ route: "resize_atom", body: { cpu: 2, memory: 4 } })).status,
	).toBe(409);

	deployment = runningDeployment;
	const response = await call({
		route: "resize_atom",
		body: { cpu: 8, memory: 16 },
	});

	expect(response.status).toBe(200);
	expect(calls.resized[0]?.pools).toEqual({
		stateful: { machine: "c8g.2xlarge", machines: 2 },
	});
});

test("retry of a deploy that has not failed is a 409", async () => {
	await startedConfig();

	expect((await call({ route: "retry_atom" })).status).toBe(409);
});

test("delete forgets the registered orgs at once and keeps the Atom under removing until alien has nothing left", async () => {
	await startedConfig();
	deployment = runningDeployment;
	await getAtom();
	stored = {
		...stored,
		orgs: {
			org_1: {
				encryptedTokens: { sandbox: "enc", live: "enc" },
				registeredAt: 1,
				percent: 100,
				previousPercent: 0,
				changedAt: 0,
			},
		},
	};

	const response = await call({ route: "delete_atom" });

	expect(response.status).toBe(200);
	expect(calls.deleted).toHaveLength(1);
	expect(stored.orgs).toEqual({});
	const removing = await getAtom();
	expect(removing.cache).toBeNull();
	expect(removing.removing).toMatchObject([{ status: "removing" }]);

	deployment = null;
	expect(await getAtom()).toMatchObject({ cache: null, removing: [] });
	expect(stored).toMatchObject({
		deploymentGroupId: null,
		endpointUrl: null,
		externalId: null,
		deployment: null,
		previous: [],
	});
});

test("a new shadow Atom made while the deleted one comes down gets its own names and group, and the old one shows under removing", async () => {
	await startedConfig();
	deployment = runningDeployment;
	await getAtom();
	await call({ route: "delete_atom" });
	const [first] = (await getAtom()).removing;

	deploymentsByGroup.dg_2 = null;
	const response = await call({
		route: "create_atom",
		body: { cpu: 8, memory: 16 },
	});

	expect(response.status).toBe(200);
	const [started] = calls.started;
	expect(started?.externalId).toMatch(SHADOW_EXTERNAL_ID);
	expect(started?.label).toMatch(SHADOW_STACK_NAME);
	expect(started?.label).not.toBe(first.stack_name);
	expect(started?.containers).toEqual({
		atom: { cpu: 7, memory: "12Gi", volumeSizeGib: 20 },
	});
	expect(stored).toMatchObject({
		deploymentGroupId: "dg_2",
		externalId: started?.externalId,
		endpointUrl: null,
	});
	const atom = await getAtom();
	expect(atom.cache).toMatchObject({
		status: "awaiting_setup",
		stack_name: started?.label,
	});
	expect(atom.removing).toMatchObject([
		{ id: first.id, stack_name: first.stack_name, status: "removing" },
	]);
	expect(atom.cache.id).not.toBe(first.id);
});

test("a new shadow Atom skips an earlier id whose alien group outlived its record, instead of reusing that group", async () => {
	await startedConfig();
	deployment = runningDeployment;
	await getAtom();
	await call({ route: "delete_atom" });
	const [removing] = (await getAtom()).removing;
	expect(removing.id).toBe("atom_b55ee51c6af650dd1aefc172");
	// The id the next Atom took last time this alternated: its group is still in alien, its record gone.
	liveGroups.add("autumn-internal-shadow-atom.atom_dd3d20bd53fb6cf8c54e4865");

	deploymentsByGroup.dg_2 = null;
	const response = await call({
		route: "create_atom",
		body: { cpu: 4, memory: 8 },
	});

	expect(response.status).toBe(200);
	expect(calls.started.map(({ externalId }) => externalId)).toEqual([
		"autumn-internal-shadow-atom.atom_001e8754e924c479a2f58865",
	]);
});

test("a shadow Atom from before Atom ids keeps its fixed names, steps aside on delete, and the next one is named apart", async () => {
	stored = configWith({
		deploymentGroupId: "dg_legacy",
		endpointUrl: ENDPOINT,
		deployment: {
			deployment_id: "dep_1",
			status: "ready",
			cpu: 4,
			memory: 8,
			region: "us-east-1",
			stages: toCacheStages({ doneStages: [], status: ByocCacheStatus.Ready }),
			error: null,
			created_at: 1,
		},
	});
	deployment = runningDeployment;
	expect((await getAtom()).cache).toMatchObject({
		id: "autumn-internal-shadow-atom",
		stack_name: "autumn-internal-shadow-atom",
	});

	await call({ route: "delete_atom" });
	expect((await getAtom()).removing).toMatchObject([
		{ id: "autumn-internal-shadow-atom", status: "removing" },
	]);

	await call({ route: "create_atom", body: { cpu: 4, memory: 8 } });
	expect(calls.started[0]?.externalId).toMatch(SHADOW_EXTERNAL_ID);
	expect(stored.previous).toMatchObject([{ deploymentGroupId: "dg_legacy" }]);
});

test("delete with an earlier Atom's id retries that Atom's removal and leaves the current one be", async () => {
	await startedConfig();
	deployment = runningDeployment;
	await getAtom();
	await call({ route: "delete_atom" });
	const [first] = (await getAtom()).removing;
	deploymentsByGroup.dg_2 = null;
	await call({ route: "create_atom", body: { cpu: 4, memory: 8 } });
	calls.deleted.length = 0;

	await call({ route: "delete_atom", body: { atom_id: first.id } });

	expect(calls.deleted).toHaveLength(1);
	expect(stored.deploymentGroupId).toBe("dg_2");
	expect((await getAtom()).cache).toMatchObject({ status: "awaiting_setup" });
});

test("a refresh that read the Atom before a delete never undoes the removal", async () => {
	await startedConfig();
	deployment = runningDeployment;
	await getAtom();
	const storage = shadowAtomStorage({ deploymentGroupId: "dg_1" });
	const readBeforeDelete = await storage.find();
	if (!readBeforeDelete) throw new Error("expected a record");

	await call({ route: "delete_atom" });
	await storage.update({
		from: readBeforeDelete,
		to: { ...readBeforeDelete, error: "stale" },
	});

	expect(stored.previous[0]?.deployment).toMatchObject({
		status: "removing",
		error: null,
	});
});

test("a setup nobody ran is forgotten as soon as it is deleted", async () => {
	await startedConfig();

	await call({ route: "delete_atom" });

	expect(stored.deploymentGroupId).toBeNull();
	expect(stored.previous).toEqual([]);
});

test("monitoring reads the same Atom metrics, by the shadow's deployment id", async () => {
	await startedConfig();
	deployment = runningDeployment;
	await getAtom();

	const response = await call({
		route: "get_atom_metrics",
		body: { range: "1h" },
	});

	expect(response.status).toBe(200);
	expect(metrics).toHaveBeenCalledWith({
		deploymentId: "dep_1",
		range: "1h",
		createdAt: expect.any(Number),
	});
});

test("an org's own key cannot touch the shadow Atom", async () => {
	const scopes = [Scopes.Organisation.Write, Scopes.Organisation.Read];
	const routes = [
		"get_atom",
		"create_atom",
		"resize_atom",
		"retry_atom",
		"delete_atom",
		"get_atom_metrics",
	];
	const responses = await Promise.all(
		routes.map((route) =>
			call({ route, scopes, body: { cpu: 2, memory: 4, range: "1h" } }),
		),
	);

	expect(responses.map(({ status }) => status)).toEqual(routes.map(() => 403));
	expect(calls.started).toHaveLength(0);
	expect(write).not.toHaveBeenCalled();
});

test("a server with no alien manager answers 503", async () => {
	getAlien.mockReturnValue(null);

	const response = await call({
		route: "create_atom",
		body: { cpu: 2, memory: 4 },
	});

	expect(response.status).toBe(503);
});
