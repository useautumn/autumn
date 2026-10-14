import { expect, test } from "bun:test";
import { apiKeys } from "@autumn/shared";
import { initAtmnScenario } from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import { hashApiKey } from "@/internal/dev/apiKeys/apiKeyUtils.js";
import { createClient } from "../../../../../packages/atmn/src/generated/client";
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
	let createdId: string | undefined;

	try {
		const mainMe = await fetchMe({ baseUrl, secretKey });
		expect(mainMe.id).toBe(ctx.org.id);
		expect(mainMe.is_sandbox).toBe(false);

		const created = await client.createSandbox({ name: sandboxName });
		createdId = created.id;

		const minted = await client.createSandboxKey({ id: created.id });
		expect(minted.id).toBe(created.id);
		expect(minted.name).toBe(sandboxName);
		expect(minted.secretKey.startsWith("am_sk_test")).toBe(true);
		expect(minted.secretKey).not.toBe(created.secretKey);

		const sandboxMe = await fetchMe({ baseUrl, secretKey: minted.secretKey });
		expect(sandboxMe.id).toBe(created.id);
		expect(sandboxMe.is_sandbox).toBe(true);
		expect(sandboxMe.created_by).toBe(ctx.org.id);

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

		const sandboxClient = createClient({
			secretKey: minted.secretKey,
			baseUrl,
		});
		await expect(
			sandboxClient.createSandboxKey({ id: created.id }),
		).rejects.toThrow(/main organization/);

		await expect(
			client.createSandboxKey({ id: "not_a_sandbox" }),
		).rejects.toThrow(/Sandbox not found/);
	} finally {
		try {
			if (createdId !== undefined)
				await client.deleteSandbox({ id: createdId });
		} finally {
			scenario.cleanup();
		}
	}
}, 600_000);
