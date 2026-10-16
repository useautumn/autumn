import { Database } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	customerRowsToSubjectState,
	parseTrackCommand,
	type SubjectState,
} from "@autumn/balance-engine";
import { createBalanceWorkerClient } from "@autumn/balance-worker-client";
import { createBalanceWorkerEnv } from "@autumn/env/balanceWorker";
import { BALANCE_WORKER_HANDOFF_CLAIM_TIMEOUT_MS } from "@autumn/env/balanceWorkerConstants";
import {
	createOwnershipConsumer,
	type PartitionOwner,
	serializeMeteringRecord,
} from "@autumn/kafka";
import { getSubjectRows, type PostgresClient } from "@autumn/postgres";
import { Kafka, logLevel } from "kafkajs";
import { createBalanceWorker } from "../../../src/init/createBalanceWorker.js";
import { createInitializeMutation } from "../../fixtures/mutations.js";
import {
	openFixturePostgres,
	readWorktreeDatabaseUrl,
	type SeededCustomer,
	seedCustomer,
} from "./postgresCustomerFixture.js";

function ignoreLog(): void {}

const brokers = process.env.KAFKA_BROKERS ?? "";
const databaseUrl = readWorktreeDatabaseUrl();

/** A lone worker always waits out the handoff-claim window before it claims; the rest covers group join, prepare and fence. */
const ADMISSION_DEADLINE_MS = BALANCE_WORKER_HANDOFF_CLAIM_TIMEOUT_MS + 15_000;
const OWNERSHIP_POLL_INTERVAL_MS = 50;

/** The seeded customer exactly as the worker would hydrate it, for the initialize record it replays. */
async function seededState({
	postgres,
	seeded,
}: {
	postgres: PostgresClient;
	seeded: SeededCustomer;
}): Promise<SubjectState> {
	const envelope = await getSubjectRows({
		ctx: { db: postgres.db, orgId: seeded.orgId, env: seeded.env },
		customerId: seeded.identity.customerId,
		asOfTimestampMs: Date.now(),
	});
	if (!envelope) throw new Error("Seeded customer not found");
	return customerRowsToSubjectState({
		identity: seeded.identity,
		customer: envelope.customer,
		customerProducts: envelope.customer_products,
		customerPrices: envelope.customer_prices,
		customerEntitlements: envelope.customer_entitlements,
		rollovers: envelope.rollovers,
		replaceables: envelope.replaceables,
		usageWindows: envelope.usage_windows,
		openLocks: envelope.open_locks,
		pooledBalances: envelope.pooled_balances,
		customerLicenses: envelope.customer_licenses,
		entity: envelope.entity,
	});
}

describe.skipIf(!brokers.trim() || !databaseUrl)(
	"Real balance worker HTTP service",
	() => {
		let postgres: PostgresClient;
		let seeded: SeededCustomer;
		beforeAll(async () => {
			if (!databaseUrl) throw new Error("No worktree DATABASE_URL");
			postgres = openFixturePostgres({ databaseUrl });
			// Tracks read the grant's catalog rows (entitlement, feature) from Postgres.
			seeded = await seedCustomer({ postgres, balance: 10 });
		});
		afterAll(async () => {
			await seeded?.cleanup();
			await postgres?.close();
		});

		test("replays initialization, claims a live listener, commits once, rejects stale routes and releases on shutdown", async () => {
			const id = crypto.randomUUID();
			const topic = `http-worker-${id}`;
			const owners = `${topic}-owners`;
			const commands = `${topic}-commands`;
			// The worker derives this name from its deployment and refuses to start without it.
			const catalogInvalidations = `${id}-catalog-invalidations`;
			const directory = mkdtempSync(join(tmpdir(), "balance-http-"));
			const databasePath = join(directory, "state.sqlite");
			const reservation = Bun.serve({
				port: 0,
				hostname: "127.0.0.1",
				fetch: () => new Response(),
			});
			const port = reservation.port;
			await reservation.stop();
			const env = {
				...createBalanceWorkerEnv({
					DATABASE_URL: databaseUrl ?? "",
					KAFKA_BROKERS: brokers,
					KAFKA_AUTH_MODE: "none",
					BALANCE_WORKER_PORT: String(port),
					BALANCE_WORKER_SQLITE_PATH: databasePath,
					BALANCE_WORKER_DEPLOYMENT: id,
				}),
				BALANCE_WORKER_METERING_TOPIC: topic,
				BALANCE_WORKER_OWNERSHIP_TOPIC: owners,
				BALANCE_WORKER_COMMAND_TOPIC: commands,
				BALANCE_WORKER_GROUP_ID: id,
				BALANCE_WORKER_PARTITION_COUNT: 1,
			};
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
					{ topic: commands, numPartitions: 1, replicationFactor: 1 },
					{
						topic: owners,
						numPartitions: 1,
						replicationFactor: 1,
						configEntries: [{ name: "cleanup.policy", value: "compact" }],
					},
					{
						topic: catalogInvalidations,
						numPartitions: 1,
						replicationFactor: 1,
					},
				],
			});
			const state = await seededState({ postgres, seeded });
			const producer = kafka.producer();
			await producer.connect();
			await producer.send({
				topic,
				messages: [
					{
						partition: 0,
						...serializeMeteringRecord({
							record: createInitializeMutation({
								state,
								commandId: `init-${id}`,
							}),
						}),
					},
				],
			});
			await producer.disconnect();
			const errors: unknown[] = [];
			const service = await createBalanceWorker({
				ctx: {
					onError: ({ cause }) => errors.push(cause),
					logger: {
						debug: ignoreLog,
						info: ignoreLog,
						warn: ignoreLog,
						error: ignoreLog,
					},
				},
				config: { env, stateBackend: "sqlite" },
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
				const admitBy = performance.now() + ADMISSION_DEADLINE_MS;
				while (!owner && performance.now() < admitBy) {
					await routing.refresh();
					owner = routing.findOwner({ partition: 0 });
					if (!owner) await Bun.sleep(OWNERSHIP_POLL_INTERVAL_MS);
				}
				if (!owner)
					throw new Error(
						`No admitted ownership within ${ADMISSION_DEADLINE_MS} ms: ${errors.map(String)}`,
					);
				expect(owner.endpoint).toBe(env.BALANCE_WORKER_ENDPOINT);
				const command = parseTrackCommand({
					input: {
						schemaVersion: 1,
						type: "track",
						org: {
							config: {
								reverse_deduction_order: false,
								block_overdue_entitlements: false,
								include_past_due: true,
							},
						},
						commandId: id,
						requestId: id,
						identity: state.identity,
						featureId: seeded.featureId,
						internalFeatureId: seeded.internalFeatureId,
						value: 3,
						overageBehavior: "reject",
						properties: null,
						usageEvent: { name: "messages", idempotencyKey: null, id: null },
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
				const first = await client.track({ command });
				expect(first.state.customerEntitlements).toMatchObject([
					{ balance: 7 },
				]);
				const duplicate = await client.track({ command });
				expect(duplicate).toEqual(first);
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
				expect(
					(await staleClient.track({ command })).state.customerEntitlements,
				).toMatchObject([{ balance: 7 }]);
				const database = new Database(databasePath, { readonly: true });
				try {
					// Initialize, then the track once: the duplicate and the stale-route resend were answered from its receipt.
					expect(
						database.query("SELECT revision FROM subject_states").all(),
					).toEqual([{ revision: 2 }]);
					expect(
						database
							.query(
								"SELECT mutation_id FROM mutation_receipts ORDER BY mutation_id",
							)
							.all(),
					).toEqual([{ mutation_id: id }, { mutation_id: `init-${id}` }]);
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
				await admin.deleteTopics({
					topics: [topic, owners, commands, catalogInvalidations],
				});
				await admin.disconnect();
				rmSync(directory, { recursive: true, force: true });
			}
		});
	},
);
