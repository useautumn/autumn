import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { AppEnv } from "@autumn/shared";
import { TrackResultSchema } from "../../../src/api/track/types/trackResult.js";
import type { Command } from "../../../src/api/types/command.js";
import type { CommandResult } from "../../../src/api/types/commandResult.js";
import { createLedgerApp } from "../../../src/http/createLedgerApp.js";
import { createShard } from "../../../src/internal/shard/createShard.js";
import type { Shard } from "../../../src/internal/shard/types/shard.js";
import { createTestShardContext } from "../testUtils/createTestShardContext.js";
import { seedSubject } from "../testUtils/seedSubject.js";

const trackCommand: Command = {
	id: "cmd_1",
	org_id: "org_1",
	env: AppEnv.Sandbox,
	customer_id: "cus_1",
	at: 1_700_000_000_000,
	api_version: "1.2",
	kind: "track",
	body: { customer_id: "cus_1", feature_id: "messages", value: 1 },
};

describe("createLedgerApp", () => {
	let shard: Shard;
	let app: ReturnType<typeof createLedgerApp>;

	beforeAll(() => {
		const ctx = createTestShardContext();
		seedSubject({
			ctx,
			orgId: "org_1",
			env: AppEnv.Sandbox,
			customerId: "cus_1",
			entitlements: [{ featureId: "messages", balance: 100, allowance: 100 }],
		});
		shard = createShard({ ctx });
		app = createLedgerApp({
			resolveShard: () => shard,
			getJournal: () => ctx.journal,
			exposeDebugRoutes: true,
		});
	});

	afterAll(async () => {
		await shard.stop();
	});

	it("serves health", async () => {
		const response = await app.request("/health");
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ ok: true });
	});

	it("rejects a body that is not a command batch", async () => {
		const response = await app.request("/commands", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ kind: "track" }),
		});
		expect(response.status).toBe(400);
	});

	it("folds a track command and answers per command", async () => {
		const response = await app.request("/commands", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify([trackCommand]),
		});

		expect(response.status).toBe(200);
		const results: CommandResult[] = await response.json();
		expect(results).toHaveLength(1);
		expect(results[0]?.id).toBe("cmd_1");
		expect(results[0]?.status).toBe(200);
		const result = TrackResultSchema.parse(results[0]?.body);
		expect(result.features.map((feature) => feature.id)).toEqual(["messages"]);
		expect(result.customer_entitlements).toMatchObject([
			{ id: "ce_cus_1_0", balance: 99 },
		]);
	});
});
