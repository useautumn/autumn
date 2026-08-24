import { describe, expect, it } from "bun:test";
import {
	AppEnv,
	CustomerNotFoundError,
	type TrackResponseV3,
} from "@autumn/shared";
import { eq } from "drizzle-orm";
import { trackResultToTrackResponse } from "../../../../../../src/api/track/trackResultToTrackResponse.js";
import { TrackResultSchema } from "../../../../../../src/api/track/types/trackResult.js";
import type { Command } from "../../../../../../src/api/types/command.js";
import type { CommandResult } from "../../../../../../src/api/types/commandResult.js";
import { createMemoryJournal } from "../../../../../../src/internal/journal/createMemoryJournal.js";
import { createShard } from "../../../../../../src/internal/shard/createShard.js";
import type { ShardContext } from "../../../../../../src/internal/shard/types/shardContext.js";
import { customerEntitlements } from "../../../../../../src/sqlite/common/schema/customerEntitlements.js";
import { createTestShardContext } from "../../../../testUtils/createTestShardContext.js";
import {
	type SeedEntitlement,
	seedSubject,
} from "../../../../testUtils/seedSubject.js";

const ORG_ID = "org_1";
const ENV = AppEnv.Sandbox;
const AT = 1_700_000_000_000;

const createHarness = () => {
	const journal = createMemoryJournal();
	const ctx: ShardContext = { ...createTestShardContext(), journal };
	const shard = createShard({ ctx });

	return { ctx, journal, shard };
};

const trackCommand = ({
	id,
	customerId,
	featureId,
	value,
	eventName,
	overageBehavior,
}: {
	id: string;
	customerId: string;
	featureId?: string;
	value?: number;
	eventName?: string;
	overageBehavior?: "cap" | "overflow" | "reject";
}): Command => ({
	id,
	org_id: ORG_ID,
	env: ENV,
	customer_id: customerId,
	at: AT,
	api_version: "1.2",
	kind: "track",
	body: {
		customer_id: customerId,
		feature_id: featureId,
		event_name: eventName,
		value,
		overage_behavior: overageBehavior,
	},
});

const seed = ({
	ctx,
	customerId,
	entitlements,
	otherFeatureIds,
}: {
	ctx: ShardContext;
	customerId: string;
	entitlements: SeedEntitlement[];
	otherFeatureIds?: string[];
}) =>
	seedSubject({
		ctx,
		orgId: ORG_ID,
		env: ENV,
		customerId,
		entitlements,
		otherFeatureIds,
	});

// The shard answers with facts; the response the caller sees is the client's,
// parsed off the wire shape first.
const trackResponseOf = ({
	result,
}: {
	result: CommandResult;
}): TrackResponseV3 =>
	trackResultToTrackResponse({
		result: TrackResultSchema.parse(JSON.parse(JSON.stringify(result.body))),
	});

const balancesOf = ({
	ctx,
	internalCustomerId,
}: {
	ctx: ShardContext;
	internalCustomerId: string;
}) =>
	ctx.sqlite
		.select({ balance: customerEntitlements.balance })
		.from(customerEntitlements)
		.where(eq(customerEntitlements.internal_customer_id, internalCustomerId))
		.all()
		.map((row) => row.balance);

describe("track", () => {
	it("case 1: deducts from a single entitlement and appends one entry", async () => {
		const { ctx, journal, shard } = createHarness();
		seed({
			ctx,
			customerId: "cus_1",
			entitlements: [{ featureId: "messages", balance: 100, allowance: 100 }],
		});

		const result = await shard.run(
			trackCommand({
				id: "cmd_1",
				customerId: "cus_1",
				featureId: "messages",
				value: 5,
			}),
		);

		expect(result.status).toBe(200);
		expect(trackResponseOf({ result })).toMatchObject({
			customer_id: "cus_1",
			value: 5,
			balance: {
				feature_id: "messages",
				granted: 100,
				remaining: 95,
				usage: 5,
			},
			deductions: [{ feature_id: "messages", value: 5 }],
		});
		expect(journal.entries).toHaveLength(1);
		expect(journal.entries[0]).toMatchObject({
			version: 1,
			kind: "balance_deducted",
			command: { id: "cmd_1", kind: "track" },
			changes: [
				{
					table: "customer_entitlements",
					op: "update",
					set: { balance: 95 },
				},
			],
		});

		await shard.stop();
	});

	it("case 2: drains entitlements in the shared deduction order", async () => {
		const { ctx, shard } = createHarness();
		const { internalCustomerId } = seed({
			ctx,
			customerId: "cus_2",
			entitlements: [
				{ featureId: "messages", balance: 30, allowance: 30 },
				{ featureId: "messages", balance: 100, allowance: 100 },
			],
		});

		await shard.run(
			trackCommand({
				id: "cmd_1",
				customerId: "cus_2",
				featureId: "messages",
				value: 50,
			}),
		);

		expect(balancesOf({ ctx, internalCustomerId })).toEqual([0, 80]);

		await shard.stop();
	});

	it("case 3: caps at zero when overage is not allowed", async () => {
		const { ctx, shard } = createHarness();
		const { internalCustomerId } = seed({
			ctx,
			customerId: "cus_3",
			entitlements: [{ featureId: "messages", balance: 10, allowance: 10 }],
		});

		const result = await shard.run(
			trackCommand({
				id: "cmd_1",
				customerId: "cus_3",
				featureId: "messages",
				value: 15,
			}),
		);

		expect(result.status).toBe(200);
		expect(trackResponseOf({ result })).toMatchObject({
			balance: { remaining: 0 },
			deductions: [{ value: 10 }],
		});
		expect(balancesOf({ ctx, internalCustomerId })).toEqual([0]);

		await shard.stop();
	});

	it("case 4: goes negative when the entitlement allows overage", async () => {
		const { ctx, shard } = createHarness();
		const { internalCustomerId } = seed({
			ctx,
			customerId: "cus_4",
			entitlements: [
				{
					featureId: "messages",
					balance: 10,
					allowance: 10,
					usageAllowed: true,
				},
			],
		});

		await shard.run(
			trackCommand({
				id: "cmd_1",
				customerId: "cus_4",
				featureId: "messages",
				value: 15,
			}),
		);

		expect(balancesOf({ ctx, internalCustomerId })).toEqual([-5]);

		await shard.stop();
	});

	it("case 5: rejects a shortfall without writing anything", async () => {
		const { ctx, journal, shard } = createHarness();
		const { internalCustomerId } = seed({
			ctx,
			customerId: "cus_5",
			entitlements: [{ featureId: "messages", balance: 10, allowance: 10 }],
		});

		const result = await shard.run(
			trackCommand({
				id: "cmd_1",
				customerId: "cus_5",
				featureId: "messages",
				value: 15,
				overageBehavior: "reject",
			}),
		);

		expect(result.status).toBe(400);
		expect(result.body).toMatchObject({ code: "insufficient_balance" });
		expect(balancesOf({ ctx, internalCustomerId })).toEqual([10]);
		expect(journal.entries).toHaveLength(0);

		await shard.stop();
	});

	it("case 6: a refund stops at the granted balance", async () => {
		const { ctx, shard } = createHarness();
		const { internalCustomerId } = seed({
			ctx,
			customerId: "cus_6",
			entitlements: [{ featureId: "messages", balance: 95, allowance: 100 }],
		});

		await shard.run(
			trackCommand({
				id: "cmd_1",
				customerId: "cus_6",
				featureId: "messages",
				value: -5,
			}),
		);

		expect(balancesOf({ ctx, internalCustomerId })).toEqual([100]);

		await shard.stop();
	});

	it("case 7: an unlimited entitlement absorbs the deduction as usage", async () => {
		const { ctx, journal, shard } = createHarness();
		const { internalCustomerId } = seed({
			ctx,
			customerId: "cus_7",
			entitlements: [{ featureId: "messages", balance: 0, unlimited: true }],
		});

		const result = await shard.run(
			trackCommand({
				id: "cmd_1",
				customerId: "cus_7",
				featureId: "messages",
				value: 5,
			}),
		);

		expect(trackResponseOf({ result })).toMatchObject({
			balance: { unlimited: true, granted: 0, remaining: 0, usage: 5 },
		});
		// The script's sink still writes: an unlimited balance counts usage down
		// from zero, so the command is a real fact about the subject.
		expect(balancesOf({ ctx, internalCustomerId })).toEqual([-5]);
		expect(journal.entries).toHaveLength(1);

		await shard.stop();
	});

	it("case 8: reports a null balance when the customer has no entitlement", async () => {
		const { ctx, journal, shard } = createHarness();
		seed({
			ctx,
			customerId: "cus_8",
			entitlements: [{ featureId: "messages", balance: 100, allowance: 100 }],
			otherFeatureIds: ["credits"],
		});

		const result = await shard.run(
			trackCommand({
				id: "cmd_1",
				customerId: "cus_8",
				featureId: "credits",
				value: 5,
			}),
		);

		expect(result.status).toBe(200);
		expect(trackResponseOf({ result })).toMatchObject({
			balance: null,
			deductions: [],
		});
		expect(journal.entries).toHaveLength(0);

		await shard.stop();
	});

	it("case 9: replays a stored result for a repeated command id", async () => {
		const { ctx, journal, shard } = createHarness();
		seed({
			ctx,
			customerId: "cus_9",
			entitlements: [{ featureId: "messages", balance: 100, allowance: 100 }],
		});

		const command = trackCommand({
			id: "cmd_replay",
			customerId: "cus_9",
			featureId: "messages",
			value: 5,
		});
		const first = await shard.run(command);
		const second = await shard.run(command);

		expect(second).toEqual(first);
		expect(journal.entries).toHaveLength(1);

		await shard.stop();
	});

	it("case 10: 404s an unknown feature", async () => {
		const { ctx, journal, shard } = createHarness();
		seed({
			ctx,
			customerId: "cus_10",
			entitlements: [{ featureId: "messages", balance: 100, allowance: 100 }],
		});

		const result = await shard.run(
			trackCommand({
				id: "cmd_1",
				customerId: "cus_10",
				featureId: "unknown_feature",
				value: 5,
			}),
		);

		expect(result.status).toBe(404);
		expect(result.body).toMatchObject({ code: "feature_not_found" });
		expect(journal.entries).toHaveLength(0);

		await shard.stop();
	});

	it("case 11: 404s when the import finds no customer", async () => {
		const { ctx, journal, shard } = createHarness();
		ctx.subjects.loadOnce = () =>
			Promise.reject(new CustomerNotFoundError({ customerId: "cus_missing" }));

		const result = await shard.run(
			trackCommand({
				id: "cmd_1",
				customerId: "cus_missing",
				featureId: "messages",
				value: 5,
			}),
		);

		expect(result.status).toBe(404);
		expect(result.body).toMatchObject({ code: "customer_not_found" });
		expect(journal.entries).toHaveLength(0);

		await shard.stop();
	});

	it("case 12: 400s reject combined with event_name", async () => {
		const { ctx, journal, shard } = createHarness();
		seed({
			ctx,
			customerId: "cus_12",
			entitlements: [{ featureId: "messages", balance: 10, allowance: 10 }],
		});

		const result = await shard.run(
			trackCommand({
				id: "cmd_1",
				customerId: "cus_12",
				eventName: "message_sent",
				value: 15,
				overageBehavior: "reject",
			}),
		);

		expect(result.status).toBe(400);
		expect(result.body).toMatchObject({ code: "invalid_request" });
		expect(journal.entries).toHaveLength(0);

		await shard.stop();
	});

	it("case 13: refuses an allocated entitlement", async () => {
		const { ctx, journal, shard } = createHarness();
		const { internalCustomerId } = seed({
			ctx,
			customerId: "cus_13",
			entitlements: [
				{
					featureId: "seats",
					balance: 10,
					allowance: 10,
					continuousFeature: true,
				},
			],
		});

		const result = await shard.run(
			trackCommand({
				id: "cmd_1",
				customerId: "cus_13",
				featureId: "seats",
				value: 5,
			}),
		);

		expect(result.status).toBe(400);
		expect(result.body).toMatchObject({ code: "paid_allocated_unsupported" });
		expect(balancesOf({ ctx, internalCustomerId })).toEqual([10]);
		expect(journal.entries).toHaveLength(0);

		await shard.stop();
	});
});
