import { expect, test } from "bun:test";
import {
	claimAutoTopupPendingKey,
	createMiscCache,
	type MiscCacheContext,
} from "@autumn/cache";
import { createConsoleLogger } from "@autumn/logging";
import { createHeraldEdgeConfigs } from "../../../src/edgeConfig/createHeraldEdgeConfigs.js";

const keys = new Set<string>();
const fakeRedis = {
	status: "ready",
	async set(key: string) {
		if (keys.has(key)) return null;
		keys.add(key);
		return "OK";
	},
} as unknown as ReturnType<NonNullable<MiscCacheContext["createClient"]>>;

/** The same package action the server runs, over herald's own misc-cache wiring. */
test("herald claims the auto top-up pending key through its misc cache", async () => {
	const edgeConfigs = createHeraldEdgeConfigs({
		ctx: {},
		config: { location: { bucket: "test-bucket", region: "us-east-2" } },
	});
	const miscCache = createMiscCache({
		ctx: {
			config: () => edgeConfigs.miscRedis.get(),
			env: { mainUrl: "redis://main.test:6379", region: "test", onEcs: false },
			decrypt: (encrypted) => encrypted,
			createClient: () => fakeRedis,
		},
		config: { commandTimeoutMs: 1_000 },
	});
	const ctx = { miscCache, logger: createConsoleLogger({ level: "error" }) };
	const key = {
		orgId: "org_1",
		env: "sandbox",
		customerId: "cus_1",
		featureId: "credits",
	};

	expect(await claimAutoTopupPendingKey({ ctx, ...key })).toBe("claimed");
	expect(await claimAutoTopupPendingKey({ ctx, ...key })).toBe(
		"pending_exists",
	);
	expect([...keys]).toEqual(["auto_topup:pending:org_1:sandbox:cus_1:credits"]);
});
