import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	createCustomerMeteringState,
	parseTrackCommand,
} from "@autumn/balance-engine";
import { createBalanceWorkerEnv } from "@autumn/env/balanceWorker";
import {
	createKafkaOwnershipLog,
	createOwnershipConsumer,
	type PartitionOwner,
	serializeMeteringRecord,
} from "@autumn/kafka";
import { Kafka, logLevel } from "kafkajs";
import { createBalanceWorker } from "../../../src/init/createBalanceWorker.js";

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
			ctx: { onError: ({ cause }) => errors.push(cause) },
			config: { env },
		});
		const log = createKafkaOwnershipLog({
			ctx: { kafka },
			config: { topic: owners },
		});
		const routing = createOwnershipConsumer({ ctx: { log } });
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
			const post = (routeEpoch: string) =>
				fetch(`${owner?.endpoint}/v1/track`, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						route: { partition: 0, routeEpoch },
						command,
					}),
				});
			const response = await post(owner.routeEpoch);
			expect(response.status).toBe(200);
			const first = await response.json();
			expect(first.decision.kind).toBe("new");
			expect(first.decision.outcome.balanceAfter).toBe(7);
			const retry = await post(owner.routeEpoch);
			expect(retry.status).toBe(200);
			const duplicate = await retry.json();
			expect(duplicate.decision.kind).toBe("duplicate");
			expect(duplicate.decision.outcome).toEqual(first.decision.outcome);
			const stale = await post((BigInt(owner.routeEpoch) + 1n).toString());
			expect(stale.status).toBe(409);
			expect((await stale.json()).error.code).toBe("NOT_OWNER");
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
			await log.disconnect?.();
			await admin.deleteTopics({ topics: [topic, owners] });
			await admin.disconnect();
			rmSync(directory, { recursive: true, force: true });
		}
	});
});
