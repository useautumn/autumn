import { afterAll, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	capabilityWorkerEnv,
	detectCapabilities,
	partitionByCapability,
	workerCapabilityServices,
} from "./testCapabilities.ts";

const testsDir = join(import.meta.dir, "../../../server/tests");
const at = (file: string) => join(testsDir, file);

const svixFile = at(
	"integration/billing/autumn-webhooks/svix-message-tags.test.ts",
);
const ssoFile = at("integration/auth/sso-facade.test.ts");
const leafFile = at("integration/auth/mcp-oauth-end-to-end.test.ts");
const billingFile = at("integration/billing/attach/attach-metadata.test.ts");

const fixtureDir = await mkdtemp(join(tmpdir(), "tw-capabilities-"));
afterAll(() => rm(fixtureDir, { recursive: true, force: true }));
const writeFixture = async (name: string, source: string) => {
	const file = join(fixtureDir, name);
	await writeFile(file, source);
	return file;
};

const svixAndLeafFile = await writeFixture(
	"svix-and-leaf.test.ts",
	[
		'import { svix } from "@tests/utils/svixWebhookTestUtils.js";',
		"await fetch(`${baseUrl}/mcp`);",
	].join("\n"),
);

test("routes known files to the capabilities they need", async () => {
	expect({
		svix: await detectCapabilities(svixFile),
		sso: await detectCapabilities(ssoFile),
		leaf: await detectCapabilities(leafFile),
		billing: await detectCapabilities(billingFile),
	}).toEqual({
		svix: ["svix"],
		sso: ["ssoIdp"],
		leaf: ["leaf"],
		billing: [],
	});
});

test("a file needing several capabilities gets all of them", async () => {
	expect(await detectCapabilities(svixAndLeafFile)).toEqual(["svix", "leaf"]);
});

test("detects /mcp requests built by template or concatenation", async () => {
	expect(
		await detectCapabilities(
			await writeFixture("concat.test.ts", 'await fetch(baseUrl + "/mcp");'),
		),
	).toEqual(["leaf"]);
});

test("keeps files that only mention the IdP or MCP hosts on the normal pool", async () => {
	for (const file of [
		"unit/auth/sso-trusted-origins.test.ts",
		"unit/auth/sso-domain-utils.test.ts",
		"unit/auth/oauth/oauth-token-resource.test.ts",
		"integration/auth/oauth-discovery-fallthrough.test.ts",
		"integration/external-psps/revenuecat-product-sync.test.ts",
	]) {
		expect({ file, capabilities: await detectCapabilities(at(file)) }).toEqual({
			file,
			capabilities: [],
		});
	}
});

test("an unreadable file stays on the normal pool", async () => {
	expect(await detectCapabilities(at("does/not/exist.test.ts"))).toEqual([]);
});

test("partitions files into one shard per capability set, preserving order", async () => {
	const otherSvix = at("integration/atmn/scenarios/pull/empty-dir.test.ts");
	expect(
		await partitionByCapability([
			billingFile,
			svixFile,
			leafFile,
			svixAndLeafFile,
			otherSvix,
			ssoFile,
		]),
	).toEqual({
		normalFiles: [billingFile],
		capabilityShards: [
			{ capabilities: ["svix"], files: [svixFile, otherSvix] },
			{ capabilities: ["leaf"], files: [leafFile] },
			{ capabilities: ["svix", "leaf"], files: [svixAndLeafFile] },
			{ capabilities: ["ssoIdp"], files: [ssoFile] },
		],
	});
	expect(await partitionByCapability([billingFile])).toEqual({
		normalFiles: [billingFile],
		capabilityShards: [],
	});
});

test("capability workers are tagged and carry each entry's env; normal workers get nothing", () => {
	expect(capabilityWorkerEnv([])).toEqual({});
	expect(capabilityWorkerEnv(["svix"])).toEqual({
		TW_CAPABILITIES: "svix",
		NEEDS_SVIX: "1",
	});
	expect(capabilityWorkerEnv(["ssoIdp"])).toEqual({
		TW_CAPABILITIES: "ssoIdp",
		SSO_DNS_SERVERS: "127.0.0.1:53535",
	});
	expect(capabilityWorkerEnv(["leaf"])).toEqual({ TW_CAPABILITIES: "leaf" });
	expect(capabilityWorkerEnv(["svix", "ssoIdp"])).toEqual({
		TW_CAPABILITIES: "svix,ssoIdp",
		NEEDS_SVIX: "1",
		SSO_DNS_SERVERS: "127.0.0.1:53535",
	});
});

test("workers boot the services their capabilities need; Svix and normal workers boot none", () => {
	const idp = {
		name: "SSO test IdP",
		cwd: "apps/sso-test-idp",
		argv: ["bun", "src/index.ts"],
		port: 9090,
	};
	const leaf = {
		name: "Leaf",
		cwd: "apps/leaf",
		argv: ["bun", "src/index.ts"],
		port: 3099,
		env: {
			PORT: "3099",
			SLACK_CLIENT_ID: "tw",
			SLACK_CLIENT_SECRET: "tw",
			SLACK_SIGNING_SECRET: "tw",
		},
	};
	expect(workerCapabilityServices({})).toEqual([]);
	expect(workerCapabilityServices({ TW_CAPABILITIES: "svix" })).toEqual([]);
	expect(workerCapabilityServices({ TW_CAPABILITIES: "nope" })).toEqual([]);
	expect(workerCapabilityServices({ TW_CAPABILITIES: "ssoIdp" })).toEqual([
		idp,
	]);
	expect(
		workerCapabilityServices({ TW_CAPABILITIES: "svix,ssoIdp,leaf" }),
	).toEqual([idp, leaf]);
});
