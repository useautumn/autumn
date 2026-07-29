import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Organization } from "@autumn/shared";
import { defaultApiVersion } from "@tests/constants.js";
import defaultCtx from "@tests/utils/testInitUtils/createTestContext.js";
import type { User } from "better-auth";
import { initDrizzle } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { logger } from "@/external/logtail/logtailUtils.js";
import { deletePlatformSubOrg } from "@/internal/orgs/deleteOrg/deletePlatformSubOrg.js";
import { createSandboxForOrg } from "@/internal/sandboxes/createSandbox.js";

// X1: drives the real public API over HTTP with AutumnInt — the same
// Authorization: Bearer <secretKey> contract the published @useautumn/sdk and
// the atmn CLI use. There is no env/sandbox field on the wire, so a per-sandbox
// secret key is the sole client-side disambiguator. Requires `bun dw`.

const { db } = initDrizzle();
const masterKey = defaultCtx.orgSecretKey;

let sandbox: Organization | undefined;
let sandboxKey = "";
let sandboxClient: AutumnInt;
let masterClient: AutumnInt;

const sandboxCustomerId = `x1_sandbox_${crypto.randomUUID()}`;
const masterCustomerId = `x1_master_${crypto.randomUUID()}`;

beforeAll(async () => {
	const actorUser = (await db.query.user.findFirst()) as unknown as User;
	const created = await createSandboxForOrg({
		db,
		masterOrg: defaultCtx.org,
		actorUser,
		name: "SDK Contract Sandbox",
	});
	sandbox = created.org;
	sandboxKey = created.secret_key;
	sandboxClient = new AutumnInt({
		secretKey: sandboxKey,
		version: defaultApiVersion,
	});
	masterClient = new AutumnInt({
		secretKey: masterKey,
		version: defaultApiVersion,
	});
}, 120_000);

afterAll(async () => {
	await sandboxClient?.customers.delete(sandboxCustomerId).catch(() => {});
	await masterClient?.customers.delete(masterCustomerId).catch(() => {});
	if (sandbox) {
		await deletePlatformSubOrg({
			db,
			org: sandbox,
			logger,
			skipLiveCustomerCheck: true,
		});
	}
});

describe("X1: public API SDK/CLI contract holds against a per-sandbox secret key", () => {
	test("a sandbox mints an ordinary test-mode key, not a special sandbox credential", () => {
		expect(sandboxKey).toMatch(/^am_sk_test/);
		expect(sandboxKey).not.toBe(masterKey);
	});

	test("the Bearer-only contract authenticates a sub-org key and scopes writes to that sandbox", async () => {
		await sandboxClient.customers.create({
			id: sandboxCustomerId,
			name: "X1 Sandbox Customer",
		});

		const got = await sandboxClient.customers.get(sandboxCustomerId);
		expect(got.id).toBe(sandboxCustomerId);

		await expect(
			masterClient.customers.get(sandboxCustomerId),
		).rejects.toThrow();
	});

	test("bidirectional isolation: a master-key customer is invisible to the sandbox key", async () => {
		await masterClient.customers.create({
			id: masterCustomerId,
			name: "X1 Master Customer",
		});

		const got = await masterClient.customers.get(masterCustomerId);
		expect(got.id).toBe(masterCustomerId);

		await expect(
			sandboxClient.customers.get(masterCustomerId),
		).rejects.toThrow();
	});
});
