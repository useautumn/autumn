import { expect, test } from "bun:test";
import type { MeteringRecord } from "@autumn/kafka";
import type { TrackResponseV3 } from "@autumn/shared";
import { initializeBalanceWorkerCustomer } from "@/internal/balances/balanceWorker/initializeBalanceWorkerCustomer.js";
import { runBalanceWorkerCheck } from "@/internal/balances/check/balanceWorker/runBalanceWorkerCheck.js";
import { createBalanceShadow } from "@/internal/balances/shadow/createBalanceShadow.js";
import { runWithBalanceShadow } from "@/internal/balances/shadow/runWithBalanceShadow.js";
import { openSqliteBalanceStateStore } from "../../../../../apps/balance-worker/src/state/sqliteBalanceStateStore.js";
import { createCustomerFixture } from "../balanceWorker/customer-fixture.js";
import {
	createWorkerFixture,
	partition,
	topic,
} from "../balanceWorker/worker-fixture.js";

test.concurrent(
	"a copied track reaches the real client, worker and SQLite without automatic initialization or double deduction",
	async () => {
		const { ctx, fullSubject } = createCustomerFixture();
		const records: MeteringRecord[] = [];
		const stateStore = openSqliteBalanceStateStore({
			databasePath: ":memory:",
		});
		stateStore.initializePartition({ topic, partition, nextOffset: 0n });
		const worker = createWorkerFixture({
			stateStore,
			records,
			now: ctx.timestamp,
		});
		const events: Record<string, unknown>[] = [];
		let delivered = Promise.withResolvers<Record<string, unknown>>();
		const mirror = createBalanceShadow({
			dependencies: {
				client: worker.client,
				report: (event) => {
					events.push(event);
					if (event.event === "completed" || event.event === "failed")
						delivered.resolve(event);
				},
			},
		});
		const session = {
			config: {
				runId: "trial",
				ownershipTopic: "shadow",
				expiresAt: ctx.timestamp + 60_000,
				customers: [
					{
						orgId: ctx.org.id,
						env: ctx.env,
						customerId: fullSubject.customerId,
						featureId: "messages",
					},
				],
			},
			mirror,
		};
		const body = {
			customer_id: fullSubject.customerId,
			feature_id: "messages",
			value: 5,
			idempotency_key: "stable-key",
		};
		const response: TrackResponseV3 = {
			customer_id: body.customer_id,
			value: 5,
			balance: null,
		};
		const execute = () =>
			runWithBalanceShadow({
				ctx,
				body,
				fullSubject,
				session,
				now: () => ctx.timestamp,
				run: async () => response,
			});
		try {
			expect(await execute()).toBe(response);
			expect(await delivered.promise).toMatchObject({ event: "failed" });
			expect(records).toHaveLength(0);

			await initializeBalanceWorkerCustomer({
				ctx,
				fullSubject,
				featureIds: ["messages"],
				initializationId: "manual-baseline",
				client: worker.client,
			});
			expect(
				await runBalanceWorkerCheck({ ctx, body, client: worker.client }),
			).toMatchObject({ balance: { remaining: 72, usage: 38 } });
			delivered = Promise.withResolvers();
			expect(await execute()).toBe(response);
			expect(await delivered.promise).toMatchObject({
				event: "completed",
				shadow: { kind: "new", remaining: 67, usage: 43 },
			});
			delivered = Promise.withResolvers();
			expect(await execute()).toBe(response);
			expect(await delivered.promise).toMatchObject({
				event: "completed",
				shadow: { kind: "duplicate", remaining: 67, usage: 43 },
			});
			expect(
				await runBalanceWorkerCheck({ ctx, body, client: worker.client }),
			).toMatchObject({ balance: { remaining: 67, usage: 43 } });
			expect(records.map((record) => record.type)).toEqual([
				"state_initialized",
				"track_outcome",
			]);
			expect(events.filter((event) => event.event === "failed")).toHaveLength(
				1,
			);
		} finally {
			await mirror.stop();
			await worker.close();
			stateStore.close();
		}
	},
);
