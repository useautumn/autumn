import { expect, test } from "bun:test";
import { join } from "node:path";
import {
	capabilityWorkerEnv,
	detectCapability,
	findTestCapability,
	partitionByCapability,
} from "./testCapabilities.ts";

const testsDir = join(import.meta.dir, "../../../server/tests");
const at = (file: string) => join(testsDir, file);

const svixFile = at(
	"integration/billing/autumn-webhooks/svix-message-tags.test.ts",
);
const ssoFile = at("integration/auth/sso-facade.test.ts");
const leafFile = at("integration/auth/mcp-oauth-end-to-end.test.ts");
const billingFile = at("integration/billing/attach/attach-metadata.test.ts");

test("routes known files to the capability they need", async () => {
	expect({
		svix: await detectCapability(svixFile),
		sso: await detectCapability(ssoFile),
		leaf: await detectCapability(leafFile),
		billing: await detectCapability(billingFile),
	}).toEqual({ svix: "svix", sso: "ssoIdp", leaf: "leaf", billing: null });
});

test("keeps files that only mention the IdP or MCP hosts on the normal pool", async () => {
	for (const file of [
		"unit/auth/sso-trusted-origins.test.ts",
		"unit/auth/sso-domain-utils.test.ts",
		"integration/auth/oauth-discovery-fallthrough.test.ts",
		"integration/external-psps/revenuecat-product-sync.test.ts",
	]) {
		expect({ file, capability: await detectCapability(at(file)) }).toEqual({
			file,
			capability: null,
		});
	}
});

test("an unreadable file stays on the normal pool", async () => {
	expect(await detectCapability(at("does/not/exist.test.ts"))).toBeNull();
});

test("partitions files into non-empty capability shards, preserving order", async () => {
	const otherSvix = at("integration/atmn/scenarios/pull/empty-dir.test.ts");
	expect(
		await partitionByCapability([
			billingFile,
			svixFile,
			leafFile,
			otherSvix,
			ssoFile,
		]),
	).toEqual({
		normalFiles: [billingFile],
		capabilityShards: [
			{ capability: "svix", files: [svixFile, otherSvix] },
			{ capability: "ssoIdp", files: [ssoFile] },
			{ capability: "leaf", files: [leafFile] },
		],
	});
	expect(await partitionByCapability([billingFile])).toEqual({
		normalFiles: [billingFile],
		capabilityShards: [],
	});
});

test("capability workers are tagged and carry their entry's env; normal workers get nothing", () => {
	expect(capabilityWorkerEnv(null)).toEqual({});
	expect(capabilityWorkerEnv("svix")).toEqual({
		TW_CAPABILITY: "svix",
		NEEDS_SVIX: "1",
	});
	expect(capabilityWorkerEnv("ssoIdp")).toMatchObject({
		TW_CAPABILITY: "ssoIdp",
		SSO_DNS_SERVERS: "127.0.0.1:53535",
	});
	expect(capabilityWorkerEnv("leaf")).toEqual({ TW_CAPABILITY: "leaf" });
});

test("the IdP and Leaf capabilities boot their service; Svix only binds", () => {
	expect(findTestCapability("svix")?.service).toBeUndefined();
	expect(findTestCapability("ssoIdp")?.service).toMatchObject({
		cwd: "apps/sso-test-idp",
		port: 9090,
	});
	expect(findTestCapability("leaf")?.service).toMatchObject({
		cwd: "apps/leaf",
		port: 3099,
	});
	expect(findTestCapability(undefined)).toBeUndefined();
	expect(findTestCapability("nope")).toBeUndefined();
});
