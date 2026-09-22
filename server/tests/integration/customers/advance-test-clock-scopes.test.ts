import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import crypto from "node:crypto";
import { AppEnv, apiKeys } from "@autumn/shared";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { eq } from "drizzle-orm";
import { createHonoApp } from "@/initHono.js";
import { hashApiKey } from "@/internal/dev/apiKeys/apiKeyUtils.js";
import { generateId } from "@/utils/genUtils.js";

const NEW_ROUTE = "/v1/customers.advance_test_clock";
const LEGACY_ROUTE = "/v1/billing.advance_test_clock";

const seedKey = async ({ scopes }: { scopes: string[] }) => {
	const key = `am_sk_test_${crypto.randomBytes(24).toString("hex")}`;
	await ctx.db.insert(apiKeys).values({
		id: generateId("key"),
		org_id: ctx.org.id,
		user_id: null,
		name: `advance-test-clock-scopes-${scopes.join("+")}`,
		prefix: key.substring(0, 14),
		created_at: Date.now(),
		env: AppEnv.Sandbox,
		hashed_key: hashApiKey(key),
		meta: {},
		scopes,
	});
	return key;
};

const post = async ({
	app,
	key,
	path,
}: {
	app: ReturnType<typeof createHonoApp>;
	key: string;
	path: string;
}) => {
	const res = await app.fetch(
		new Request(`http://localhost${path}`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${key}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				customer_id: generateId("clock_scope"),
				frozen_time: Date.now() + 60_000,
			}),
		}),
	);
	const body = (await res.json().catch(() => ({}))) as { code?: string };
	return { status: res.status, code: body.code };
};

const describeDb = process.env.TESTS_ORG ? describe : describe.skip;

describeDb("advance_test_clock scopes", () => {
	let app: ReturnType<typeof createHonoApp>;
	let customersWriteKey: string;
	let billingWriteKey: string;

	beforeAll(async () => {
		app = createHonoApp();
		customersWriteKey = await seedKey({ scopes: ["customers:write"] });
		billingWriteKey = await seedKey({ scopes: ["billing:write"] });
	});

	afterAll(async () => {
		const rows = await ctx.db
			.select({ id: apiKeys.id, name: apiKeys.name })
			.from(apiKeys)
			.where(eq(apiKeys.org_id, ctx.org.id));
		for (const row of rows) {
			if (row.name?.startsWith("advance-test-clock-scopes-")) {
				await ctx.db.delete(apiKeys).where(eq(apiKeys.id, row.id));
			}
		}
	});

	// A missing customer proves the scope gate passed; 403 would fire first.
	test("customers:write passes the scope gate on both routes", async () => {
		for (const path of [NEW_ROUTE, LEGACY_ROUTE]) {
			const res = await post({ app, key: customersWriteKey, path });
			expect(res).toEqual({ status: 404, code: "customer_not_found" });
		}
	});

	test("billing:write passes only on the legacy route", async () => {
		expect(
			await post({ app, key: billingWriteKey, path: LEGACY_ROUTE }),
		).toEqual({ status: 404, code: "customer_not_found" });
		expect(await post({ app, key: billingWriteKey, path: NEW_ROUTE })).toEqual({
			status: 403,
			code: "insufficient_scopes",
		});
	});
});
