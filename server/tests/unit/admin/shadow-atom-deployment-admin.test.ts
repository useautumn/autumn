import { afterAll, afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import type { AlienClient, AlienDeployment } from "@autumn/alien";
import { type ShadowAtomConfig, shadowAtomConfig } from "@autumn/edge-config";
import { RecaseError, Scopes } from "@autumn/shared";
import { Hono } from "hono";
import { z } from "zod/v4";
import * as alienClientModule from "@/external/alien/getAlienClient.js";
import * as lockModule from "@/external/redis/utils/lockUtils/withLock.js";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import {
	handleCreateAdminShadowAtomDeployment,
	handleDeleteAdminShadowAtomDeployment,
	handleGetAdminShadowAtomDeployment,
	handleResizeAdminShadowAtomDeployment,
} from "@/internal/admin/handleAdminShadowAtomDeployment.js";
import { shadowAtomConfigStore } from "@/internal/misc/shadowAtom/shadowAtomConfigStore.js";

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
	getDeployment: async () => null,
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

let stored = shadowAtomConfig.defaultValue();
const getAlien = spyOn(alienClientModule, "getAlienClient").mockReturnValue(
	alienClient,
);
// Locks are Redis's to prove; here they only run what they guard.
const lock = spyOn(lockModule, "withLock").mockImplementation(({ fn }) => fn());
const write = spyOn(shadowAtomConfigStore, "writeToSource").mockResolvedValue();
const read = spyOn(shadowAtomConfigStore, "readFromSource").mockImplementation(
	async () => structuredClone(stored),
);

beforeEach(() => {
	stored = shadowAtomConfig.defaultValue();
	deployment = null;
	getAlien.mockReturnValue(alienClient);
	for (const list of Object.values(calls)) list.length = 0;
});
afterEach(() => {
	write.mockClear();
	read.mockClear();
});
afterAll(() => {
	lock.mockRestore();
	getAlien.mockRestore();
	write.mockRestore();
	read.mockRestore();
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
	const path = "/admin/shadow-atom-config/deployment";
	app.get(path, ...handleGetAdminShadowAtomDeployment);
	app.post(path, ...handleCreateAdminShadowAtomDeployment);
	app.patch(path, ...handleResizeAdminShadowAtomDeployment);
	app.delete(path, ...handleDeleteAdminShadowAtomDeployment);
	return app;
};

const staff = [Scopes.Superuser];

const send = ({
	method,
	body,
	scopes = staff,
}: {
	method: string;
	body?: unknown;
	scopes?: string[];
}) =>
	createApp({ scopes }).request("/admin/shadow-atom-config/deployment", {
		method,
		headers: { "Content-Type": "application/json" },
		body: body === undefined ? undefined : JSON.stringify(body),
	});

const lastWritten = () => write.mock.calls.at(-1)?.[0].config;

test("staff create the shadow Atom with the customer's alien stack, in multi-tenant mode, under a fixed admin group", async () => {
	const response = await send({
		method: "POST",
		body: { admin_token_hash: "admin_hash", cpu: 4, memory: 8 },
	});

	expect(response.status).toBe(200);
	expect(await response.json()).toEqual({
		deployment_group_id: "dg_1",
		setup_url: "https://setup.example",
	});
	const [started] = calls.started;
	expect(started?.externalId).toEndWith("autumn-internal-shadow-atom");
	expect(started?.label).toEndWith("autumn-internal-shadow-atom");
	expect(started?.pools).toEqual({
		stateful: { machine: "c7g.xlarge", machines: 1 },
	});
	const variables = Object.fromEntries(
		(started?.environmentVariables ?? []).map(({ name, value }) => [
			name,
			value,
		]),
	);
	expect(variables).toMatchObject({
		ATOM_MODE: "multi_tenant",
		ATOM_TOKEN_HASH: "admin_hash",
	});
	expect(variables.ATOM_ADMIN_TOKEN_HASH).toBeUndefined();
	expect(lastWritten()?.deploymentGroupId).toBe("dg_1");
});

test("a machine that is not offered is refused before alien is called", async () => {
	const response = await send({
		method: "POST",
		body: { admin_token_hash: "admin_hash", cpu: 3, memory: 3 },
	});

	expect(response.status).toBe(400);
	expect(calls.started).toHaveLength(0);
	expect(write).not.toHaveBeenCalled();
});

test("with no deployment, staff read null and alien is never asked", async () => {
	const response = await send({ method: "GET" });

	expect(response.status).toBe(200);
	expect(await response.json()).toEqual({ deployment: null });
	expect(calls.found).toHaveLength(0);
});

test("reading a running deployment saves its endpoint into the config, once", async () => {
	stored = configWith({ deploymentGroupId: "dg_1" });
	deployment = runningDeployment;

	const first = await send({ method: "GET" });

	expect(await first.json()).toEqual({
		deployment: {
			deployment_group_id: "dg_1",
			status: "ready",
			endpoint_url: ENDPOINT,
			machine: { cpu: 2, memory: 1 },
		},
	});
	expect(lastWritten()?.endpointUrl).toBe(ENDPOINT);

	write.mockClear();
	stored = configWith({ deploymentGroupId: "dg_1", endpointUrl: ENDPOINT });
	await send({ method: "GET" });
	expect(write).not.toHaveBeenCalled();
});

test("a setup nobody has run yet reads as awaiting setup with no endpoint", async () => {
	stored = configWith({ deploymentGroupId: "dg_1" });

	const response = await send({ method: "GET" });

	expect(await response.json()).toEqual({
		deployment: {
			deployment_group_id: "dg_1",
			status: "awaiting_setup",
			endpoint_url: null,
			machine: null,
		},
	});
	expect(write).not.toHaveBeenCalled();
});

test("resize moves the running Atom's pool to the new machine", async () => {
	stored = configWith({ deploymentGroupId: "dg_1" });
	deployment = runningDeployment;

	const response = await send({
		method: "PATCH",
		body: { cpu: 8, memory: 16 },
	});

	expect(response.status).toBe(200);
	expect(calls.resized[0]?.pools).toEqual({
		stateful: { machine: "c7g.2xlarge", machines: 1 },
	});
});

test("resize of an Atom still awaiting setup is a 409", async () => {
	stored = configWith({ deploymentGroupId: "dg_1" });

	const response = await send({ method: "PATCH", body: { cpu: 2, memory: 4 } });

	expect(response.status).toBe(409);
	expect(calls.resized).toHaveLength(0);
});

test("an endpoint alien no longer reports is cleared, so the shadow check stops", async () => {
	stored = configWith({ deploymentGroupId: "dg_1", endpointUrl: ENDPOINT });

	await send({ method: "GET" });

	expect(lastWritten()?.endpointUrl).toBeNull();
	expect(lastWritten()?.deploymentGroupId).toBe("dg_1");
});

test("resize with nothing deployed is a 409", async () => {
	const response = await send({ method: "PATCH", body: { cpu: 2, memory: 4 } });

	expect(response.status).toBe(409);
	expect(calls.resized).toHaveLength(0);
});

test("delete tears the deployment down and forgets its group, endpoint and registered orgs", async () => {
	stored = configWith({
		deploymentGroupId: "dg_1",
		endpointUrl: ENDPOINT,
		orgs: {
			org_1: {
				encryptedTokens: { sandbox: "enc", live: "enc" },
				registeredAt: 1,
				percent: 100,
				previousPercent: 0,
				changedAt: 0,
			},
		},
	});
	deployment = runningDeployment;

	const response = await send({ method: "DELETE" });

	expect(response.status).toBe(200);
	expect(await response.json()).toEqual({ deleted: true });
	expect(calls.deleted).toHaveLength(1);
	expect(lastWritten()).toMatchObject({
		deploymentGroupId: null,
		endpointUrl: null,
		orgs: {},
	});
});

test("an org's own key cannot touch the shadow Atom's deployment", async () => {
	const scopes = [Scopes.Organisation.Write, Scopes.Organisation.Read];
	const responses = await Promise.all([
		send({ method: "GET", scopes }),
		send({
			method: "POST",
			scopes,
			body: { admin_token_hash: "h", cpu: 2, memory: 1 },
		}),
		send({ method: "PATCH", scopes, body: { cpu: 2, memory: 1 } }),
		send({ method: "DELETE", scopes }),
	]);

	expect(responses.map(({ status }) => status)).toEqual([403, 403, 403, 403]);
	expect(calls.started).toHaveLength(0);
	expect(write).not.toHaveBeenCalled();
});

test("a server with no alien manager answers 503", async () => {
	getAlien.mockReturnValue(null);

	const response = await send({
		method: "POST",
		body: { admin_token_hash: "h", cpu: 2, memory: 1 },
	});

	expect(response.status).toBe(503);
});
