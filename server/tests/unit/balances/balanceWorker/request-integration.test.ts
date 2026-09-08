import { expect, test } from "bun:test";
import type { MeteringRecord } from "@autumn/kafka";
import { InsufficientBalanceError, type TrackParams } from "@autumn/shared";
import { initializeBalanceWorkerCustomer } from "@/internal/balances/balanceWorker/initializeBalanceWorkerCustomer.js";
import { runBalanceWorkerCheck } from "@/internal/balances/check/balanceWorker/runBalanceWorkerCheck.js";
import { runBalanceWorkerTrack } from "@/internal/balances/track/balanceWorker/runBalanceWorkerTrack.js";
import { parsePartitionCheckpoint } from "../../../../../apps/balance-worker/src/checkpoint/partitionCheckpoint.js";
import { openSqliteBalanceStateStore } from "../../../../../apps/balance-worker/src/state/sqliteBalanceStateStore.js";
import { createCustomerFixture } from "./customer-fixture.js";
import {
	checkpointLimits,
	createWorkerFixture,
	partition,
	topic,
} from "./worker-fixture.js";

test.concurrent(
	"mapped customer requests retain exact responses through the client, worker, checkpoint and replay",
	async () => {
		const fixture = createCustomerFixture();
		fixture.customerEntitlement.balance = 10;
		const { ctx, fullSubject } = fixture;
		const identity = {
			orgId: ctx.org.id,
			env: ctx.env,
			customerId: fullSubject.customerId,
		};
		const records: MeteringRecord[] = [];
		const liveStore = openSqliteBalanceStateStore({ databasePath: ":memory:" });
		const restoredStore = openSqliteBalanceStateStore({
			databasePath: ":memory:",
		});
		liveStore.initializePartition({ topic, partition, nextOffset: 0n });
		const live = createWorkerFixture({
			stateStore: liveStore,
			records,
			now: ctx.timestamp,
		});
		const restored = createWorkerFixture({
			stateStore: restoredStore,
			records,
			now: ctx.timestamp,
		});
		const initialization = {
			ctx,
			fullSubject,
			featureIds: ["messages"],
			initializationId: "baseline",
		};
		const body: TrackParams = {
			customer_id: fullSubject.customerId,
			feature_id: "messages",
			value: 5,
			overage_behavior: "reject",
			idempotency_key: "first",
		};
		try {
			await expect(
				runBalanceWorkerCheck({ ctx, body, client: live.client }),
			).rejects.toMatchObject({
				code: "balance_worker_not_initialized",
				statusCode: 409,
			});
			expect(
				await initializeBalanceWorkerCustomer({
					...initialization,
					client: live.client,
				}),
			).toMatchObject({
				kind: "initialized",
				state: { identity, revision: 0 },
			});
			expect(
				await runBalanceWorkerCheck({ ctx, body, client: live.client }),
			).toMatchObject({
				allowed: true,
				balance: { remaining: 10, granted: 110, usage: 100 },
			});
			const checkpoint = parsePartitionCheckpoint({
				input: liveStore.capturePartitionCheckpoint({
					topic,
					partition,
					createdAt: ctx.timestamp,
					limits: checkpointLimits,
				}).serialized,
			});
			const results = await Promise.allSettled(
				["first", "second", "third"].map((idempotencyKey) =>
					runBalanceWorkerTrack({
						ctx,
						body: { ...body, idempotency_key: idempotencyKey },
						client: live.client,
					}),
				),
			);
			expect(results[0]).toMatchObject({
				status: "fulfilled",
				value: {
					balance: {
						remaining: 5,
						granted: 110,
						usage: 105,
						next_reset_at: 1_800_000_000_000,
						breakdown: [{ id: "public_grant", plan_id: "pro" }],
					},
				},
			});
			expect(results[1]).toMatchObject({
				status: "fulfilled",
				value: { balance: { remaining: 0, usage: 110 } },
			});
			expect(results[2]).toMatchObject({
				status: "rejected",
				reason: expect.any(InsufficientBalanceError),
			});
			expect(liveStore.readState({ identity })).toMatchObject({ revision: 3 });
			expect(records.map((record) => record.type)).toEqual([
				"state_initialized",
				"track_outcome",
				"track_outcome",
				"track_outcome",
			]);
			const firstResult = results[0];
			if (firstResult.status !== "fulfilled")
				throw new Error("Expected the first track to apply");
			expect(
				await runBalanceWorkerTrack({ ctx, body, client: live.client }),
			).toEqual(firstResult.value);
			expect(
				await initializeBalanceWorkerCustomer({
					...initialization,
					client: live.client,
				}),
			).toMatchObject({ kind: "duplicate" });
			expect(
				await initializeBalanceWorkerCustomer({
					...initialization,
					initializationId: "different_baseline",
					client: live.client,
				}),
			).toEqual({ kind: "already_initialized" });
			const changedSubject = structuredClone(fullSubject);
			changedSubject.customer_products[0].customer_entitlements[0].balance = 99;
			await expect(
				initializeBalanceWorkerCustomer({
					...initialization,
					fullSubject: changedSubject,
					client: live.client,
				}),
			).rejects.toMatchObject({
				code: "balance_worker_initialization_conflict",
				statusCode: 409,
			});
			const checked = await runBalanceWorkerCheck({
				ctx,
				body,
				client: live.client,
			});
			expect(checked).toMatchObject({
				allowed: false,
				balance: { granted: 110, remaining: 0, usage: 110 },
			});
			expect(records).toHaveLength(4);
			await live.close();

			restoredStore.restorePartitionCheckpoint({
				checkpoint,
				mode: "restore",
				limits: checkpointLimits,
				partitionResolver: { partitionForIdentity: () => partition },
			});
			restoredStore.applyDurableMutations({
				records: records
					.map((mutation, index) => ({
						position: { topic, partition, offset: BigInt(index) },
						mutation,
					}))
					.filter(({ position }) => position.offset >= checkpoint.nextOffset),
			});
			expect(restoredStore.readState({ identity })).toEqual(
				liveStore.readState({ identity }),
			);
			expect(
				await runBalanceWorkerCheck({ ctx, body, client: restored.client }),
			).toEqual(checked);
			expect(
				await runBalanceWorkerTrack({ ctx, body, client: restored.client }),
			).toEqual(firstResult.value);
			expect(
				await initializeBalanceWorkerCustomer({
					...initialization,
					client: restored.client,
				}),
			).toMatchObject({ kind: "duplicate" });
			expect(records).toHaveLength(4);
		} finally {
			await Promise.all([live.close(), restored.close()]);
			liveStore.close();
			restoredStore.close();
		}
	},
);
