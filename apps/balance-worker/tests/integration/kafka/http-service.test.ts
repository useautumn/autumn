import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	createCustomerMeteringState,
	parseTrackCommand,
} from "@autumn/balance-engine";
import { createBalanceWorkerClient } from "@autumn/balance-worker-client";
import { createBalanceWorkerEnv } from "@autumn/env/balanceWorker";
import {
	createOwnershipConsumer,
	type PartitionOwner,
	serializeMeteringRecord,
} from "@autumn/kafka";
import { Kafka, logLevel } from "kafkajs";
import { createBalanceWorker } from "../../../src/init/createBalanceWorker.js";

function ignoreLog(): void {}

const brokers = process.env.KAFKA_BROKERS;
if (!brokers?.trim())
	throw new Error("Run test:kafka with an environment broker");

describe("Real balance worker HTTP service", () => {
	test("replays initialization, claims a live listener, commits once, rejects stale routes and releases on shutdown", async () => {
		const id = crypto.randomUUID();
		const topic = `http-worker-${id}`;
		const owners = `${topic}-owners`;
		const directory = mkdtempSync(join(tmpdir(), "balance-http-"));
		const databasePath = join(directory, "state.sqlite");
		const reservation = Bun.serve({
			port: 0,
			hostname: "127.0.0.1",
			fetch: () => new Response(),
		});
		const port = reservation.port;
		await reservation.stop();
		const env = createBalanceWorkerEnv({
			KAFKA_BROKERS: brokers,
			BALANCE_WORKER_PORT: String(port),
			BALANCE_WORKER_SQLITE_PATH: databasePath,
			BALANCE_WORKER_METERING_TOPIC: topic,
			BALANCE_WORKER_OWNERSHIP_TOPIC: owners,
			BALANCE_WORKER_PARTITION_COUNT: "1",
			BALANCE_WORKER_GROUP_ID: id,
			BALANCE_WORKER_DEPLOYMENT: id,
		});
		const kafka = new Kafka({
			clientId: id,
			brokers: env.KAFKA_BROKERS,
			logLevel: logLevel.NOTHING,
		});
		const admin = kafka.admin();
		await admin.connect();
		await admin.createTopics({
			waitForLeaders: true,
			topics: [
				{ topic, numPartitions: 1, replicationFactor: 1 },
				{
					topic: owners,
					numPartitions: 1,
					replicationFactor: 1,
					configEntries: [{ name: "cleanup.policy", value: "compact" }],
				},
			],
		});
		const state = createCustomerMeteringState({
			identity: { orgId: "org", env: "sandbox", customerId: "customer" },
			featureStatesById: {
				messages: {
					kind: "direct_metered_v1",
					customerEntitlements: [{ id: "balance", balance: 10, usage: 0 }],
				},
			},
		});
		const producer = kafka.producer();
		await producer.connect();
		await producer.send({
			topic,
			messages: [
				{
					partition: 0,
					...serializeMeteringRecord({
						record: {
							schemaVersion: 1,
							type: "state_initialized",
							initializationId: id,
							initializedAt: 0,
							state,
						},
					}),
				},
			],
		});
		await producer.disconnect();
		const errors: unknown[] = [];
		const service = await createBalanceWorker({
			ctx: {
				onError: ({ cause }) => errors.push(cause),
				logger: { info: ignoreLog, warn: ignoreLog, error: ignoreLog },
			},
			config: { env },
		});
		const routing = createOwnershipConsumer({
			ctx: { kafka },
			config: { topic: owners },
		});
		try {
			await service.start();
			expect(
				await (await fetch(`${env.BALANCE_WORKER_ENDPOINT}/health`)).json(),
			).toEqual({ status: "alive" });
			await routing.start();
			let owner: PartitionOwner | undefined;
			for (let attempt = 0; attempt < 100 && !owner; attempt++) {
				await routing.refresh();
				owner = routing.findOwner({ partition: 0 });
				if (!owner) await Bun.sleep(20);
			}
			if (!owner)
				throw new Error(`No admitted ownership: ${errors.map(String)}`);
			expect(owner.endpoint).toBe(env.BALANCE_WORKER_ENDPOINT);
			const command = parseTrackCommand({
				input: {
					schemaVersion: 1,
					type: "track",
					commandId: id,
					requestId: id,
					identity: state.identity,
					entityId: null,
					featureId: "messages",
					value: 3,
					overageBehavior: "reject",
					properties: null,
					occurredAt: Date.now(),
				},
			});
			function post(routeEpoch: string) {
				return fetch(`${owner?.endpoint}/v1/track`, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						route: { partition: 0, routeEpoch },
						command,
					}),
				});
			}
			const client = createBalanceWorkerClient({
				ctx: { owners: routing },
				config: { partitionCount: 1, timeoutMs: 5000 },
			});
			const first = { decision: await client.track({ command }) };
			expect(first.decision.kind).toBe("new");
			if (first.decision.kind !== "new")
				throw new Error("Expected a new decision");
			expect(first.decision.outcome.balanceAfter).toBe(7);
			const duplicate = { decision: await client.track({ command }) };
			expect(duplicate.decision.kind).toBe("duplicate");
			if (duplicate.decision.kind !== "duplicate")
				throw new Error("Expected a duplicate decision");
			expect(duplicate.decision.outcome).toEqual(first.decision.outcome);
			const stale = await post((BigInt(owner.routeEpoch) + 1n).toString());
			expect(stale.status).toBe(409);
			expect((await stale.json()).error.code).toBe("NOT_OWNER");
			let cachedOwner: PartitionOwner | undefined = {
				...owner,
				routeEpoch: (BigInt(owner.routeEpoch) + 1n).toString(),
			};
			function findCachedOwner() {
				return cachedOwner;
			}
			async function refreshCachedOwner(): Promise<void> {
				await routing.refresh();
				cachedOwner = routing.findOwner({ partition: 0 });
			}
			const staleClient = createBalanceWorkerClient({
				ctx: {
					owners: { findOwner: findCachedOwner, refresh: refreshCachedOwner },
				},
				config: { partitionCount: 1, timeoutMs: 5000 },
			});
			expect((await staleClient.track({ command })).kind).toBe("duplicate");
			const database = new Database(databasePath, { readonly: true });
			try {
				expect(
					database.query("SELECT revision FROM customer_states").get(),
				).toEqual({ revision: 1 });
				expect(
					database.query("SELECT COUNT(*) AS count FROM track_receipts").get(),
				).toEqual({ count: 1 });
			} finally {
				database.close();
			}
			await service.stop();
			await routing.refresh();
			expect(routing.findOwner({ partition: 0 })).toBeUndefined();
			expect(errors).toEqual([]);
		} finally {
			await service.stop();
			await routing.stop();
			await admin.deleteTopics({ topics: [topic, owners] });
			await admin.disconnect();
			rmSync(directory, { recursive: true, force: true });
		}
	});
});
