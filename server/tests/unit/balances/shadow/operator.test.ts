import { expect, test } from "bun:test";
import type { MeteringRecord } from "@autumn/kafka";
import { inspectBalanceShadowCustomer } from "@/internal/balances/shadow/operator/inspectBalanceShadowCustomer.js";
import { openSqliteBalanceStateStore } from "../../../../../apps/balance-worker/src/state/sqliteBalanceStateStore.js";
import { createCustomerFixture } from "../balanceWorker/customer-fixture.js";
import {
	createWorkerFixture,
	partition,
	topic,
} from "../balanceWorker/worker-fixture.js";

function setup() {
	const fixture = createCustomerFixture();
	const records: MeteringRecord[] = [];
	const stateStore = openSqliteBalanceStateStore({ databasePath: ":memory:" });
	stateStore.initializePartition({ topic, partition, nextOffset: 0n });
	const worker = createWorkerFixture({
		stateStore,
		records,
		now: fixture.ctx.timestamp,
	});
	const input = {
		ctx: fixture.ctx,
		customerId: "cus_test",
		featureIds: ["messages"],
		runId: "operator",
		expiresAt: fixture.ctx.timestamp + 60_000,
		client: worker.client,
		loadSubject: async () => structuredClone(fixture.fullSubject),
	};
	return {
		...fixture,
		...worker,
		records,
		stateStore,
		input,
		close: async () => {
			await worker.close();
			stateStore.close();
		},
	};
}

test.concurrent(
	"operator previews by default, initializes explicitly, then compares through the real worker client",
	async () => {
		const fixture = setup();
		try {
			expect(
				await inspectBalanceShadowCustomer({
					...fixture.input,
					mode: "initialize",
				}),
			).toMatchObject({
				status: "preview",
				redis: { messages: { balance: 72, usage: 38 } },
			});
			expect(fixture.records).toHaveLength(0);
			expect(
				await inspectBalanceShadowCustomer({
					...fixture.input,
					mode: "compare",
				}),
			).toMatchObject({ status: "inconclusive" });
			expect(fixture.records).toHaveLength(0);
			expect(
				await inspectBalanceShadowCustomer({
					...fixture.input,
					mode: "initialize",
					execute: true,
				}),
			).toMatchObject({
				status: "equal_at_read",
				initialization: "initialized",
				worker: { messages: { balance: 72, usage: 38, revision: 0 } },
			});
			expect(
				await inspectBalanceShadowCustomer({
					...fixture.input,
					mode: "initialize",
					execute: true,
				}),
			).toMatchObject({ initialization: "duplicate" });
			await fixture.client.track({
				command: {
					schemaVersion: 1,
					type: "track",
					commandId: "track",
					requestId: "track",
					identity: {
						orgId: fixture.ctx.org.id,
						env: fixture.ctx.env,
						customerId: "cus_test",
					},
					entityId: null,
					featureId: "messages",
					value: 5,
					overageBehavior: "cap",
					properties: null,
					occurredAt: fixture.ctx.timestamp,
				},
			});
			fixture.customerEntitlement.balance = 67;
			expect(
				await inspectBalanceShadowCustomer({
					...fixture.input,
					mode: "compare",
				}),
			).toMatchObject({
				status: "equal_at_read",
				redis: { messages: { balance: 67, usage: 43 } },
				worker: { messages: { balance: 67, usage: 43, revision: 1 } },
			});
			const count = fixture.records.length;
			expect(
				await inspectBalanceShadowCustomer({
					...fixture.input,
					mode: "initialize",
					execute: true,
				}),
			).toMatchObject({ status: "inconclusive" });
			expect(
				await inspectBalanceShadowCustomer({
					...fixture.input,
					mode: "initialize",
					execute: true,
					runId: "new-run",
				}),
			).toMatchObject({
				status: "inconclusive",
				initialization: "already_initialized",
			});
			expect(fixture.records).toHaveLength(count);
		} finally {
			await fixture.close();
		}
	},
);

test.concurrent(
	"comparison reports differences and moving baselines without changing either system",
	async () => {
		const fixture = setup();
		try {
			await inspectBalanceShadowCustomer({
				...fixture.input,
				mode: "initialize",
				execute: true,
			});
			fixture.customerEntitlement.balance = 70;
			expect(
				await inspectBalanceShadowCustomer({
					...fixture.input,
					mode: "compare",
				}),
			).toMatchObject({
				status: "different_at_read",
				redis: { messages: { balance: 70 } },
				worker: { messages: { balance: 72 } },
			});
			let reads = 0;
			expect(
				await inspectBalanceShadowCustomer({
					...fixture.input,
					mode: "compare",
					loadSubject: async () => {
						if (++reads > 1) fixture.customerEntitlement.balance = 69;
						return structuredClone(fixture.fullSubject);
					},
				}),
			).toMatchObject({
				status: "inconclusive",
				reason: "Redis baseline changed during the operation",
			});
			expect(fixture.records.map(({ type }) => type)).toEqual([
				"state_initialized",
			]);
		} finally {
			await fixture.close();
		}
	},
);

test.concurrent("unsafe baselines never initialize the worker", async () => {
	const fixture = setup();
	try {
		for (const loadSubject of [
			async () => {
				throw new Error("Redis cache is missing");
			},
			async () => ({ ...fixture.fullSubject, customerId: "wrong-customer" }),
		])
			expect(
				await inspectBalanceShadowCustomer({
					...fixture.input,
					mode: "initialize",
					execute: true,
					loadSubject,
				}),
			).toMatchObject({ status: "inconclusive" });
		expect(
			await inspectBalanceShadowCustomer({
				...fixture.input,
				mode: "initialize",
				execute: true,
				expiresAt: fixture.customerEntitlement.next_reset_at!,
			}),
		).toMatchObject({
			status: "inconclusive",
			reason: "Reset or expiry falls inside the shadow window",
		});
		expect(fixture.records).toHaveLength(0);
	} finally {
		await fixture.close();
	}
});
