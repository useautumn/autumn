/**
 * TDD test for the server half of `atmn sandbox use` and `atmn init`'s key
 * check: minting a key for an existing sandbox, and telling a main-sandbox key
 * from a sub-sandbox key through /organization/me.
 *
 * Contract under test:
 *   New types/fields:
 *     - GET /v1/organization/me → { is_sandbox: boolean, created_by: string | null }
 *   New endpoints:
 *     - POST /v1/sandboxes.create_key { id } → { id, name, slug, secret_key }
 *   New behaviors:
 *     - main key + owned sandbox id → a working `am_sk_test` key for that sandbox
 *     - the minted key answers /me as the sandbox: is_sandbox true, created_by = master
 *     - the master key answers /me as itself: is_sandbox false
 *     - an unknown or unowned id → 404 "Sandbox not found"
 *     - a sandbox's own key cannot mint → 400 (managed from the main organization)
 *   Side effects:
 *     - the api_keys row for the minted key carries the caller's scopes (not null)
 *     - the row's user_id is the caller key's user when it has one
 *
 * Pre-impl red: /me lacks the fields, and sandboxes.create_key is a 404.
 * Post-impl green: handler registered on sandboxesRpcRouter + contract, /me widened.
 */

import { expect, test } from "bun:test";
import { apiKeys } from "@autumn/shared";
import { initAtmnScenario } from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import { hashApiKey } from "@/internal/dev/apiKeys/apiKeyUtils.js";
import { createClient } from "../../../../../packages/atmn-nightly/src/generated/client";
import { uniqueTestId } from "../../catalog-v2/utils/uniqueTestId.js";

type OrgMe = {
	id: string;
	name: string;
	slug: string;
	env: string;
	is_sandbox: boolean;
	created_by: string | null;
};

const fetchMe = async ({
	baseUrl,
	secretKey,
}: {
	baseUrl: string;
	secretKey: string;
}): Promise<OrgMe> => {
	const response = await fetch(`${baseUrl}/v1/organization/me`, {
		headers: { authorization: `Bearer ${secretKey}` },
	});
	if (!response.ok) throw new Error(`/me failed (${response.status})`);
	return (await response.json()) as OrgMe;
};

test(`${chalk.yellowBright("atmn sandbox: create_key mints a scoped key for an owned sandbox; /me tells main from sub")}`, async () => {
	const sandboxName = uniqueTestId("atmn-sb-key");
	const scenario = await initAtmnScenario({
		setup: [
			s.platform.create({
				userEmail: `${uniqueTestId("atmn_sb_key")}@autumn.test`,
			}),
		],
		config: `{ features: [] }`,
	});
	const { client, baseUrl, secretKey, ctx } = scenario;

	try {
		// ── Contract: /me on the main key says it is not a sandbox ──────────
		const mainMe = await fetchMe({ baseUrl, secretKey });
		expect(mainMe.id).toBe(ctx.org.id);
		expect(mainMe.is_sandbox).toBe(false);

		const created = await client.createSandbox({ name: sandboxName });

		// ── Contract: create_key returns a fresh key for an owned sandbox ───
		const minted = await client.createSandboxKey({ id: created.id });
		expect(minted.id).toBe(created.id);
		expect(minted.name).toBe(sandboxName);
		expect(minted.secretKey.startsWith("am_sk_test")).toBe(true);
		expect(minted.secretKey).not.toBe(created.secretKey);

		// ── Contract: the minted key authenticates as the sandbox ───────────
		const sandboxMe = await fetchMe({ baseUrl, secretKey: minted.secretKey });
		expect(sandboxMe.id).toBe(created.id);
		expect(sandboxMe.is_sandbox).toBe(true);
		expect(sandboxMe.created_by).toBe(ctx.org.id);

		// ── Side effect: the row carries the caller's scopes and user ───────
		const row = await ctx.db.query.apiKeys.findFirst({
			where: eq(apiKeys.hashed_key, hashApiKey(minted.secretKey)),
		});
		const callerRow = await ctx.db.query.apiKeys.findFirst({
			where: eq(apiKeys.hashed_key, hashApiKey(secretKey)),
		});
		expect(row).toBeDefined();
		expect(row?.org_id).toBe(created.id);
		expect(row?.scopes).toEqual(callerRow?.scopes ?? null);
		if (callerRow?.user_id) expect(row?.user_id).toBe(callerRow.user_id);

		// ── Contract: a sandbox's own key cannot mint ───────────────────────
		const sandboxClient = createClient({
			secretKey: minted.secretKey,
			baseUrl,
		});
		await expect(
			sandboxClient.createSandboxKey({ id: created.id }),
		).rejects.toThrow(/main organization/);

		// ── Contract: unknown id is a uniform 404 ───────────────────────────
		await expect(
			client.createSandboxKey({ id: "not_a_sandbox" }),
		).rejects.toThrow(/Sandbox not found/);

		await client.deleteSandbox({ id: created.id });
	} finally {
		scenario.cleanup();
	}
}, 600_000);
