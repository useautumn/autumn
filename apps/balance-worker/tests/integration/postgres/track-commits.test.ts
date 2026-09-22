import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseTrackCommand, type TrackCommand } from "@autumn/balance-engine";
import {
	type BalanceWorkerClient,
	createBalanceWorkerClient,
} from "@autumn/balance-worker-client";
import { createBalanceWorkerEnv } from "@autumn/env/balanceWorker";
import { createOwnershipConsumer, type OwnershipConsumer } from "@autumn/kafka";
import type { PostgresClient } from "@autumn/postgres";
import { sql } from "drizzle-orm";
import { Kafka, logLevel } from "kafkajs";
import { createBalanceWorker } from "../../../src/init/createBalanceWorker.js";
import {
	openFixturePostgres,
	readWorktreeDatabaseUrl,
	type SeededCustomer,
	seedCustomer,
} from "./postgresCustomerFixture.js";

const brokers = (process.env.KAFKA_BROKERS ?? "").split(",").filter(Boolean);
const databaseUrl = readWorktreeDatabaseUrl();
const PARTITION_COUNT = 1;
const PARTITION = 0;
const LOOPBACK_HOST = "127.0.0.1";
const OWNERSHIP_POLL_ATTEMPTS = 200;
const OWNERSHIP_POLL_INTERVAL_MS = 50;

type Harness = {
	deployment: string;
	topics: { metering: string; ownership: string };
	routing: OwnershipConsumer;
	client: BalanceWorkerClient;
	stop(): Promise<void>;
};

type RunningWorker = { endpoint: string; stop(): Promise<void> };

function ignoreLog(): void {}

function describeErrors(errors: unknown[]): string {
	if (errors.length === 0) return "no errors reported";
	const describe = (error: unknown): string => {
		if (!(error instanceof Error)) return String(error);
		const cause =
			error.cause === undefined ? "" : ` <- ${describe(error.cause)}`;
		return `${error.name}: ${error.message}${cause}`;
	};
	return errors.map(describe).join(" | ");
}

async function reserveLoopbackPort(): Promise<number> {
	const reservation = Bun.serve({
		port: 0,
		hostname: LOOPBACK_HOST,
		fetch: () => new Response(),
	});
	try {
		const port = reservation.port;
		if (port === undefined) throw new Error("Bun did not expose a port");
		return port;
	} finally {
		await reservation.stop();
	}
}

async function createHarness(): Promise<Harness> {
	const deployment = `pg-commit-${crypto.randomUUID()}`;
	const topics = { metering: deployment, ownership: `${deployment}-owners` };
	const kafka = new Kafka({
		clientId: deployment,
		brokers,
		logLevel: logLevel.NOTHING,
	});
	const admin = kafka.admin();
	await admin.connect();
	await admin.createTopics({
		waitForLeaders: true,
		topics: [
			{
				topic: topics.metering,
				numPartitions: PARTITION_COUNT,
				replicationFactor: 1,
			},
			{
				topic: topics.ownership,
				numPartitions: PARTITION_COUNT,
				replicationFactor: 1,
				configEntries: [{ name: "cleanup.policy", value: "compact" }],
			},
		],
	});
	const routing = createOwnershipConsumer({
		ctx: { kafka },
		config: { topic: topics.ownership },
	});
	await routing.start();
	const client = createBalanceWorkerClient({
		ctx: { owners: routing },
		config: { partitionCount: PARTITION_COUNT, timeoutMs: 10_000 },
	});
	async function stop(): Promise<void> {
		await routing.stop();
		await admin.deleteTopics({ topics: [topics.metering, topics.ownership] });
		await admin.disconnect();
	}
	return { deployment, topics, routing, client, stop };
}

/** A whole worker on the postgres backend: Kafka log, Postgres rows and bookmark, no SQLite. */
async function startWorker({
	harness,
}: {
	harness: Harness;
}): Promise<RunningWorker> {
	if (!databaseUrl) throw new Error("No worktree DATABASE_URL");
	const directory = mkdtempSync(join(tmpdir(), "pg-commit-"));
	const env = {
		...createBalanceWorkerEnv({
			DATABASE_URL: databaseUrl,
			KAFKA_BROKERS: brokers.join(","),
			KAFKA_AUTH_MODE: "none",
			BALANCE_WORKER_HOST: LOOPBACK_HOST,
			BALANCE_WORKER_PORT: String(await reserveLoopbackPort()),
			BALANCE_WORKER_SQLITE_PATH: join(directory, "unused.sqlite"),
			BALANCE_WORKER_DEPLOYMENT: harness.deployment,
		}),
		BALANCE_WORKER_METERING_TOPIC: harness.topics.metering,
		BALANCE_WORKER_OWNERSHIP_TOPIC: harness.topics.ownership,
		BALANCE_WORKER_GROUP_ID: harness.deployment,
		BALANCE_WORKER_PARTITION_COUNT: PARTITION_COUNT,
	};
	const errors: unknown[] = [];
	const worker = await createBalanceWorker({
		ctx: {
			onError: ({ cause }) => {
				errors.push(cause);
				runtimeErrors.push(cause);
			},
			logger: {
				debug: ignoreLog,
				info: ignoreLog,
				warn: (...args: unknown[]) => workerLogs.push(["warn", ...args]),
				error: (...args: unknown[]) => workerLogs.push(["error", ...args]),
			},
		},
		config: { env, stateBackend: "postgres" },
	});
	await worker.start();
	let owned = false;
	for (
		let attempt = 0;
		attempt < OWNERSHIP_POLL_ATTEMPTS && !owned;
		attempt++
	) {
		await harness.routing.refresh();
		owned =
			harness.routing.findOwner({ partition: PARTITION })?.endpoint ===
			env.BALANCE_WORKER_ENDPOINT;
		if (!owned) await Bun.sleep(OWNERSHIP_POLL_INTERVAL_MS);
	}
	if (!owned) {
		await worker.stop();
		throw new Error(
			`Worker never owned partition ${PARTITION}: ${describeErrors(errors)}`,
		);
	}
	return {
		endpoint: env.BALANCE_WORKER_ENDPOINT,
		stop: async () => {
			await worker.stop();
			rmSync(directory, { recursive: true, force: true });
		},
	};
}

function trackCommand({
	customer,
	commandId,
	value,
}: {
	customer: SeededCustomer;
	commandId: string;
	value: number;
}): TrackCommand {
	return parseTrackCommand({
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
			commandId,
			requestId: `req_${commandId}`,
			identity: customer.identity,
			featureId: customer.featureId,
			internalFeatureId: customer.internalFeatureId,
			value,
			overageBehavior: "reject",
			properties: null,
			occurredAt: Date.now(),
		},
	});
}

/** Worker-side warnings, errors and runtime failures, surfaced when a request fails. */
const workerLogs: unknown[][] = [];
const runtimeErrors: unknown[] = [];

async function trackOrExplain(
	harness: Harness,
	command: TrackCommand,
): Promise<Awaited<ReturnType<BalanceWorkerClient["track"]>>> {
	try {
		return await harness.client.track({ command });
	} catch (cause) {
		throw new Error(
			`track failed: ${cause instanceof Error ? cause.message : String(cause)}\nruntime errors: ${describeErrors(runtimeErrors)}\nworker logs: ${JSON.stringify(workerLogs, (_, value) => (value instanceof Error ? { name: value.name, message: value.message, cause: value.cause instanceof Error ? value.cause.message : value.cause } : value), 1)}`,
		);
	}
}

const balanceOf = (
	reply: { state: { customerEntitlements: { id: string; balance: number }[] } },
	id: string,
) => reply.state.customerEntitlements.find((row) => row.id === id)?.balance;

describe.skipIf(brokers.length === 0 || !databaseUrl)(
	"postgres backend",
	() => {
		let postgres: PostgresClient;
		let customer: SeededCustomer;
		let harness: Harness;
		const workers: RunningWorker[] = [];

		beforeAll(async () => {
			if (!databaseUrl) throw new Error("No worktree DATABASE_URL");
			postgres = openFixturePostgres({ databaseUrl });
			customer = await seedCustomer({ postgres, balance: 100 });
			harness = await createHarness();
		});

		afterAll(async () => {
			for (const worker of workers.reverse()) await worker.stop();
			await harness?.stop();
			await customer?.cleanup();
			await postgres?.close();
		});

		test("a track lands in customer_entitlements and advances the bookmark; a restart continues from Postgres", async () => {
			const first = await startWorker({ harness });
			workers.push(first);

			const reply = await trackOrExplain(
				harness,
				trackCommand({ customer, commandId: "cmd_1", value: 5 }),
			);
			expect(reply.result.status).toBe("applied");
			expect(balanceOf(reply, customer.customerEntitlementId)).toBe(95);
			expect(await customer.readBalance()).toBe(95);
			expect(
				await customer.readNextOffset({
					topic: harness.topics.metering,
					partition: PARTITION,
				}),
			).toBe(1n);

			await first.stop();
			workers.pop();
			const second = await startWorker({ harness });
			workers.push(second);

			const next = await trackOrExplain(
				harness,
				trackCommand({ customer, commandId: "cmd_2", value: 5 }),
			);
			expect(balanceOf(next, customer.customerEntitlementId)).toBe(90);
			expect(await customer.readBalance()).toBe(90);
			// Offset 1 was the first transaction's commit marker; the second record sits at 2.
			expect(
				await customer.readNextOffset({
					topic: harness.topics.metering,
					partition: PARTITION,
				}),
			).toBe(3n);

			// The first worker's memory died with it; the log refilled the second's on boot.
			await expect(
				harness.client.track({
					command: trackCommand({ customer, commandId: "cmd_1", value: 5 }),
				}),
			).rejects.toMatchObject({ workerCode: "DUPLICATE_COMMAND" });
			expect(await customer.readBalance()).toBe(90);
		}, 60_000);

		test("a row deleted underneath a decision refuses that track alone: 409, bookmark past it, the next track re-hydrates, a restart replays it as settled", async () => {
			const worker = workers.at(-1) ?? (await startWorker({ harness }));
			if (!workers.includes(worker)) workers.push(worker);
			const moved = await seedCustomer({ postgres, balance: 100 });
			try {
				const first = await trackOrExplain(
					harness,
					trackCommand({ customer: moved, commandId: "moved_1", value: 5 }),
				);
				expect(balanceOf(first, moved.customerEntitlementId)).toBe(95);
				const bookmarkBefore = await moved.readNextOffset({
					topic: harness.topics.metering,
					partition: PARTITION,
				});

				// The legacy path removes the row without telling the worker, as a customer delete does.
				await moved.deleteGrant();

				await expect(
					harness.client.track({
						command: trackCommand({
							customer: moved,
							commandId: "moved_2",
							value: 5,
						}),
					}),
				).rejects.toMatchObject({
					workerCode: "STALE_SUBJECT",
					outcome: "not_submitted",
				});
				// The refused record still moved the bookmark: a replay never meets it again.
				const bookmarkAfter = await moved.readNextOffset({
					topic: harness.topics.metering,
					partition: PARTITION,
				});
				expect(bookmarkAfter).not.toBeNull();
				expect(bookmarkAfter as bigint).toBeGreaterThan(
					bookmarkBefore as bigint,
				);

				// The worker still owns the partition and decides the next track on fresh rows.
				await moved.restoreGrant({ balance: 50 });
				const third = await trackOrExplain(
					harness,
					trackCommand({ customer: moved, commandId: "moved_3", value: 5 }),
				);
				expect(balanceOf(third, moved.customerEntitlementId)).toBe(45);
				expect(await moved.readBalance()).toBe(45);

				// A restart replays the log from below the bookmark without tripping on the refused record.
				await worker.stop();
				workers.splice(workers.indexOf(worker), 1);
				const replacement = await startWorker({ harness });
				workers.push(replacement);
				const fourth = await trackOrExplain(
					harness,
					trackCommand({ customer: moved, commandId: "moved_4", value: 5 }),
				);
				expect(balanceOf(fourth, moved.customerEntitlementId)).toBe(40);
				expect(await moved.readBalance()).toBe(40);
			} finally {
				await moved.cleanup();
			}
		}, 90_000);
	},
);
