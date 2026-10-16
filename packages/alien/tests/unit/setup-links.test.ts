import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createAlienClient } from "../../src/createAlienClient.js";

type Recorded = { method: string; path: string; body: unknown };

const SETUP_LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const GROUP_ID = "dg_1";

let requests: Recorded[] = [];
let warnings: { message: string; data: Record<string, unknown> }[] = [];
let revokeStatus = 204;
let existingGroup = false;
/** The group's deployments as alien lists them; a stack is still up until one reads `deleted`. */
let groupDeploymentStatuses: string[] = [];
const realFetch = globalThis.fetch;

const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});

/** The hosted manager as each call of a setup or revoke sees it. */
const answer = ({ method, path }: Recorded): Response => {
	if (path.startsWith("/v1/deployment-groups/by-external-id"))
		return existingGroup
			? json({ id: GROUP_ID, name: "atom-acme" })
			: json({}, 404);
	if (path.startsWith("/v1/projects/") && path.includes("/template-urls"))
		return json({ aws: { templateUrl: "https://templates.example/t.yaml" } });
	if (path.startsWith("/v1/projects/")) return json({ defaultManagers: {} });
	if (path.startsWith("/v1/managers"))
		return json([
			{
				id: "mgr_1",
				isSystem: true,
				managementConfigs: {
					aws: { managingRoleArn: "arn:aws:iam::1:role/alien" },
				},
			},
		]);
	if (method === "GET" && path.startsWith("/v1/deployments?"))
		return json({
			items: groupDeploymentStatuses.map((status, index) => ({
				id: `dep_${index}`,
				status,
			})),
		});
	if (path.startsWith("/v1/deployment-groups/setup-links"))
		return json({ token: "tok_1", deploymentGroup: { id: GROUP_ID } });
	if (method === "GET" && path.startsWith("/v1/api-keys"))
		return json({
			items: [
				{
					id: "key_old",
					role: "deployment-group.deployer",
					deploymentGroupId: GROUP_ID,
					revokedAt: null,
				},
			],
			nextCursor: null,
		});
	if (method === "DELETE" && path.startsWith("/v1/api-keys"))
		return revokeStatus === 204
			? new Response(null, { status: 204 })
			: json({ code: "UNAUTHORIZED" }, revokeStatus);
	return json({}, 200);
};

const client = () =>
	createAlienClient({
		config: {
			kind: "hosted",
			apiKey: "key",
			project: "autumn-staging",
			workspace: "autumn",
		},
		logger: { warn: (message, data) => warnings.push({ message, data }) },
	});

const startSetup = () =>
	client().startSetup({
		externalId: "org_1.sandbox.atom_1",
		label: "atom-acme",
		region: "us-east-1",
		environmentVariables: [],
		pools: { stateful: { machine: "c8g.2xlarge", machines: 1 } },
		containers: { atom: { cpu: 7, memory: "12Gi", volumeSizeGib: 20 } },
		network: null,
	});

beforeEach(() => {
	requests = [];
	warnings = [];
	revokeStatus = 204;
	existingGroup = false;
	groupDeploymentStatuses = [];
	globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
		const url = new URL(String(input));
		const recorded = {
			method: init?.method ?? "GET",
			path: `${url.pathname}${url.search}`,
			body: init?.body ? JSON.parse(String(init.body)) : undefined,
		};
		requests.push(recorded);
		return answer(recorded);
	}) as typeof fetch;
});

afterEach(() => {
	globalThis.fetch = realFetch;
});

const setupLinkBody = () =>
	requests.find(({ path }) =>
		path.startsWith("/v1/deployment-groups/setup-links"),
	)?.body as Record<string, unknown>;

describe("a setup link", () => {
	test("expires a week after it is minted, and its new group takes one deployment", async () => {
		const before = Date.now();
		await startSetup();
		const after = Date.now();

		const body = setupLinkBody();
		expect(body.maxDeployments).toBe(1);
		const expiresAt = Date.parse(String(body.expiresAt));
		expect(expiresAt).toBeGreaterThanOrEqual(before + SETUP_LINK_TTL_MS);
		expect(expiresAt).toBeLessThanOrEqual(after + SETUP_LINK_TTL_MS);
	});

	test("a fresh link for an existing group revokes the older ones first", async () => {
		existingGroup = true;
		await startSetup();

		expect(
			requests.some(
				({ method, path }) =>
					method === "DELETE" && path.startsWith("/v1/api-keys/key_old"),
			),
		).toBe(true);
		expect(warnings).toEqual([]);
	});

	test("a link our role may not revoke is logged by key id and skipped, and the new link is still minted", async () => {
		existingGroup = true;
		revokeStatus = 403;

		const setup = await startSetup();

		expect(setup.deploymentGroupId).toBe(GROUP_ID);
		expect(warnings).toEqual([
			{
				message: expect.stringContaining("refused to revoke a setup link"),
				data: { keyId: "key_old", deploymentGroupId: GROUP_ID },
			},
		]);
	});

	test("any other revoke failure still fails", async () => {
		revokeStatus = 500;

		await expect(
			client().revokeSetupLinksOnceDeleted({ deploymentGroupId: GROUP_ID }),
		).rejects.toThrow("alien 500");
		expect(warnings).toEqual([]);
	});
});

const revokedOldLink = () =>
	requests.some(
		({ method, path }) =>
			method === "DELETE" && path.startsWith("/v1/api-keys/key_old"),
	);

describe("a setup link a stack was launched from", () => {
	test("stays while the stack is still up, so the stack's delete can still reach alien", async () => {
		existingGroup = true;
		groupDeploymentStatuses = ["teardown-required"];

		await startSetup();

		expect(revokedOldLink()).toBe(false);
		expect(setupLinkBody()).toBeDefined();
	});

	test("is revoked once alien has deleted every deployment of its group", async () => {
		groupDeploymentStatuses = ["deleted"];

		await client().revokeSetupLinksOnceDeleted({ deploymentGroupId: GROUP_ID });

		expect(revokedOldLink()).toBe(true);
	});

	test("one deployment still being deleted keeps every link", async () => {
		groupDeploymentStatuses = ["deleted", "deleting"];

		await client().revokeSetupLinksOnceDeleted({ deploymentGroupId: GROUP_ID });

		expect(revokedOldLink()).toBe(false);
	});
});
