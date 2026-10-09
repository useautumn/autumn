import { afterAll, beforeEach, expect, spyOn, test } from "bun:test";
import type { AlienClient, AlienDeployment } from "@autumn/alien";
import { type ShadowAtomConfig, shadowAtomConfig } from "@autumn/edge-config";
import { RecaseError, Scopes } from "@autumn/shared";
import { Hono } from "hono";
import { z } from "zod/v4";
import * as alienClientModule from "@/external/alien/getAlienClient.js";
import * as lockModule from "@/external/redis/utils/lockUtils/withLock.js";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import * as atomMetricsModule from "@/internal/byoc/actions/telemetry/atomLogs/queryAtomMetrics.js";
import { atomTokenToHash } from "@/internal/byoc/utils/atomTokenUtils.js";
import { shadowAtomConfigStore } from "@/internal/misc/shadowAtom/shadowAtomConfigStore.js";
import { shadowAtomRpcRouter } from "@/internal/misc/shadowAtom/shadowAtomRouter.js";
import { shadowAtomStorage } from "@/internal/misc/shadowAtom/shadowAtomStorage.js";
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
		compute: { pools: { stateful: { machine: "t4g.micro" } } },
	},
};

const calls = {
	started: [] as Parameters<AlienClient["startSetup"]>[0][],
	resized: [] as Parameters<AlienClient["updateDeploymentCompute"]>[0][],
	deleted: [] as Parameters<AlienClient["deleteDeployment"]>[0][],
	found: [] as Parameters<AlienClient["findDeployment"]>[0][],
};
let deployment: AlienDeployment | null = null;

const alienClient: AlienClient = {
	startSetup: async (params) => {
		calls.started.push(params);
		return { deploymentGroupId: "dg_1", setupUrl: "https://setup.example" };
	},
	findDeployment: async (params) => {
		calls.found.push(params);
		return deployment;
	},
	getDeployment: async () => deployment,
	retryDeployment: async () => {},
	updateDeploymentCompute: async (params) => {
		calls.resized.push(params);
	},
	deleteDeployment: async (params) => {
		calls.deleted.push(params);
	},
	revokeSetupLinks: async () => {},
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
});

beforeEach(() => {
	stored = shadowAtomConfig.defaultValue();
	deployment = null;
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
	expect(started?.externalId).toEndWith("autumn-internal-shadow-atom");
	expect(started?.pools).toEqual({
		stateful: { machine: "c7g.xlarge", machines: 1 },
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
		memory: 1,
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
		stateful: { machine: "c7g.2xlarge", machines: 1 },
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
		deployment: null,
	});
});

test("a refresh that read the Atom before a delete never undoes the removal", async () => {
	await startedConfig();
	deployment = runningDeployment;
	await getAtom();
	const readBeforeDelete = await shadowAtomStorage.find();
	if (!readBeforeDelete) throw new Error("expected a record");

	await call({ route: "delete_atom" });
	await shadowAtomStorage.update({
		from: readBeforeDelete,
		to: { ...readBeforeDelete, error: "stale" },
	});

	expect(stored.deployment).toMatchObject({ status: "removing", error: null });
});

test("a setup nobody ran is forgotten as soon as it is deleted", async () => {
	await startedConfig();

	await call({ route: "delete_atom" });

	expect(stored.deploymentGroupId).toBeNull();
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
	expect(metrics).toHaveBeenCalledWith({ deploymentId: "dep_1", range: "1h" });
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
			call({ route, scopes, body: { cpu: 2, memory: 1, range: "1h" } }),
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
		body: { cpu: 2, memory: 1 },
	});

	expect(response.status).toBe(503);
});
