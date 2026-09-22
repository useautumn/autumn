import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	type CheckCommand,
	parseCheckCommand,
	parseResetCommand,
	parseTrackCommand,
	type ResetCommand,
	type TrackCommand,
} from "@autumn/balance-engine";
import {
	type BalanceWorkerClient,
	createBalanceWorkerClient,
} from "@autumn/balance-worker-client";
import { createBalanceWorkerEnv } from "@autumn/env/balanceWorker";
import {
	createCommandPublisher,
	createIdempotentProducerConfig,
	createOwnershipConsumer,
	type OwnershipConsumer,
} from "@autumn/kafka";
import type { PostgresClient } from "@autumn/postgres";
import { sql } from "drizzle-orm";
import { Kafka, logLevel } from "kafkajs";
import { createBalanceWorker } from "../../../src/init/createBalanceWorker.js";
import {
	openFixturePostgres,
	readWorktreeDatabaseUrl,
	type SeededCustomer,
	seedCustomer,
	seedPool,
} from "./postgresCustomerFixture.js";

const brokers = (process.env.KAFKA_BROKERS ?? "").split(",").filter(Boolean);
const databaseUrl = readWorktreeDatabaseUrl();
const PARTITION_COUNT = 1;
const PARTITION = 0;
const LOOPBACK_HOST = "127.0.0.1";
const OWNERSHIP_POLL_ATTEMPTS = 200;
const OWNERSHIP_POLL_INTERVAL_MS = 50;

type Harness = {
	admin: ReturnType<Kafka["admin"]>;
	deployment: string;
	topics: { metering: string; ownership: string; commands: string };
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
	const topics = {
		metering: deployment,
		ownership: `${deployment}-owners`,
		commands: `${deployment}-commands`,
	};
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
				topic: topics.commands,
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
	const producer = kafka.producer(
		createIdempotentProducerConfig({
			limits: { retryCount: 3, initialRetryTimeMs: 100, maxRetryTimeMs: 1_000 },
		}),
	);
	await producer.connect();
	const client = createBalanceWorkerClient({
		ctx: {
			owners: routing,
			commandLog: createCommandPublisher({
				ctx: { producer, topic: topics.commands },
			}),
		},
		config: { partitionCount: PARTITION_COUNT, timeoutMs: 10_000 },
	});
	async function stop(): Promise<void> {
		await routing.stop();
		await producer.disconnect();
		await admin.deleteTopics({
			topics: [topics.metering, topics.ownership, topics.commands],
		});
		await admin.disconnect();
	}
	return { deployment, topics, routing, client, stop, admin };
}

/** A whole worker on the postgres backend: Kafka log, Postgres rows and bookmark, no SQLite. */
async function startWorker({
	harness,
	subprocess = false,
}: {
	harness: Harness;
	subprocess?: boolean;
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
		BALANCE_WORKER_COMMAND_TOPIC: harness.topics.commands,
		BALANCE_WORKER_GROUP_ID: harness.deployment,
		BALANCE_WORKER_PARTITION_COUNT: PARTITION_COUNT,
	};
	const errors: unknown[] = [];
	const child = subprocess
		? Bun.spawn(
				[
					"bun",
					"--config=./bunfig.toml",
					fileURLToPath(new URL("./commandWorker.ts", import.meta.url)),
				],
				{
					env: { ...process.env, BALANCE_WORKER_TEST_ENV: JSON.stringify(env) },
					stdout: "inherit",
					stderr: "inherit",
				},
			)
		: null;
	const worker = child
		? {
				start: async () => {},
				stop: async () => {
					child.kill("SIGKILL");
					await child.exited;
				},
			}
		: await createBalanceWorker({
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
	occurredAt = Date.now(),
}: {
	customer: SeededCustomer;
	commandId: string;
	value: number;
	occurredAt?: number;
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
			occurredAt,
		},
	});
}

function checkCommand({
	customer,
	requestId,
	requiredBalance,
}: {
	customer: SeededCustomer;
	requestId: string;
	requiredBalance: number;
}): CheckCommand {
	return parseCheckCommand({
		input: {
			schemaVersion: 1,
			type: "check",
			org: {
				config: {
					reverse_deduction_order: false,
					block_overdue_entitlements: false,
					include_past_due: true,
				},
			},
			requestId,
			identity: customer.identity,
			featureId: customer.featureId,
			internalFeatureId: customer.internalFeatureId,
			requiredBalance,
			properties: null,
			occurredAt: Date.now(),
		},
	});
}

function resetCommand({
	customer,
	commandId,
	occurredAt = Date.now(),
}: {
	customer: SeededCustomer;
	commandId: string;
	occurredAt?: number;
}): ResetCommand {
	return parseResetCommand({
		input: {
			schemaVersion: 1,
			type: "reset",
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
			occurredAt,
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

async function waitForBalance({
	customer,
	balance,
	attempts = 200,
}: {
	customer: SeededCustomer;
	balance: number;
	attempts?: number;
}): Promise<number> {
	let seen = await customer.readBalance();
	for (let attempt = 0; attempt < attempts && seen !== balance; attempt++) {
		await Bun.sleep(50);
		seen = await customer.readBalance();
	}
	return seen;
}

async function waitForCommandGroupOffset({
	harness,
	nextOffset,
}: {
	harness: Harness;
	nextOffset: bigint;
}): Promise<void> {
	for (let attempt = 0; attempt < 200; attempt++) {
		const offsets = await harness.admin.fetchOffsets({
			groupId: harness.deployment,
			topics: [harness.topics.commands],
		});
		const current = offsets[0]?.partitions[0]?.offset;
		if (current && BigInt(current) >= nextOffset) return;
		await Bun.sleep(50);
	}
	throw new Error(`Command group did not reach ${nextOffset}`);
}

async function waitForCommandBookmark({
	customer,
	harness,
	nextOffset,
}: {
	customer: SeededCustomer;
	harness: Harness;
	nextOffset: bigint;
}): Promise<void> {
	let current: bigint | null = null;
	for (let attempt = 0; attempt < 200; attempt++) {
		current = await customer.readCommandNextOffset({
			topic: harness.topics.metering,
			partition: PARTITION,
		});
		if (current === nextOffset) return;
		await Bun.sleep(50);
	}
	expect(current).toBe(nextOffset);
}

async function waitForBookmarkPast({
	customer,
	harness,
	bookmark,
}: {
	customer: SeededCustomer;
	harness: Harness;
	bookmark: bigint | null;
}): Promise<bigint> {
	let current: bigint | null = null;
	for (let attempt = 0; attempt < 200; attempt++) {
		current = await customer.readNextOffset({
			topic: harness.topics.metering,
			partition: PARTITION,
		});
		if (current !== null && (bookmark === null || current > bookmark)) {
			return current;
		}
		await Bun.sleep(50);
	}
	throw new Error(`Bookmark never moved past ${bookmark}`);
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
			// The reply comes when Kafka has the record; Postgres follows a moment later.
			expect(await waitForBalance({ customer, balance: 95 })).toBe(95);
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
			expect(await waitForBalance({ customer, balance: 90 })).toBe(90);
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

			// Queued, not sent: the owner consumes it from the command topic and the row still moves.
			await harness.client.queue.track({
				commands: [trackCommand({ customer, commandId: "cmd_3", value: 5 })],
			});
			expect(await waitForBalance({ customer, balance: 85 })).toBe(85);
			// Queued again under the same id: consumed as a duplicate, nothing moves.
			await harness.client.queue.track({
				commands: [trackCommand({ customer, commandId: "cmd_3", value: 5 })],
			});
			await Bun.sleep(1_000);
			expect(await customer.readBalance()).toBe(85);
		}, 60_000);

		test("a crash after the command's Kafka commit replays both bookmarks before commands resume", async () => {
			const isolated = await createHarness();
			const crashCustomer = await seedCustomer({ postgres, balance: 100 });
			let running: RunningWorker | undefined;
			const locked = Promise.withResolvers<void>();
			const unlock = Promise.withResolvers<void>();
			let holding: Promise<unknown> | undefined;
			try {
				running = await startWorker({ harness: isolated, subprocess: true });
				holding = postgres.db.transaction(async (transaction) => {
					await transaction.execute(
						sql`SELECT next_offset FROM partition_progress WHERE topic = ${isolated.topics.metering} AND partition_id = ${PARTITION} FOR UPDATE`,
					);
					locked.resolve();
					await unlock.promise;
				});
				await Promise.race([locked.promise, holding]);
				const command = trackCommand({
					customer: crashCustomer,
					commandId: "crash_command",
					value: 5,
				});
				await isolated.client.queue.track({ commands: [command] });
				await waitForCommandGroupOffset({ harness: isolated, nextOffset: 1n });
				expect(await crashCustomer.readBalance()).toBe(100);
				expect(
					await crashCustomer.readCommandNextOffset({
						topic: isolated.topics.metering,
						partition: PARTITION,
					}),
				).toBeNull();
				await running.stop();
				running = undefined;
				unlock.resolve();
				await holding;

				running = await startWorker({ harness: isolated });
				expect(
					await waitForBalance({ customer: crashCustomer, balance: 95 }),
				).toBe(95);
				expect(
					await crashCustomer.readCommandNextOffset({
						topic: isolated.topics.metering,
						partition: PARTITION,
					}),
				).toBe(1n);

				// A duplicate at a different offset and an unreadable record both finish without another deduction.
				await isolated.client.queue.track({ commands: [command] });
				await waitForCommandBookmark({
					customer: crashCustomer,
					harness: isolated,
					nextOffset: 2n,
				});
				const sender = new Kafka({
					clientId: "command-poison",
					brokers,
					logLevel: logLevel.NOTHING,
				}).producer();
				await sender.connect();
				try {
					await sender.send({
						topic: isolated.topics.commands,
						messages: [{ partition: PARTITION, value: "invalid" }],
					});
				} finally {
					await sender.disconnect();
				}
				await waitForCommandBookmark({
					customer: crashCustomer,
					harness: isolated,
					nextOffset: 3n,
				});
				expect(await crashCustomer.readBalance()).toBe(95);
				await running.stop();
				running = undefined;

				// The group is behind Postgres: takeover still seeks past the three completed commands.
				await isolated.admin.setOffsets({
					groupId: isolated.deployment,
					topic: isolated.topics.commands,
					partitions: [{ partition: PARTITION, offset: "0" }],
				});
				running = await startWorker({ harness: isolated });
				await isolated.client.queue.track({
					commands: [
						trackCommand({
							customer: crashCustomer,
							commandId: "after_restart",
							value: 5,
						}),
					],
				});
				expect(
					await waitForBalance({ customer: crashCustomer, balance: 90 }),
				).toBe(90);
				await waitForCommandBookmark({
					customer: crashCustomer,
					harness: isolated,
					nextOffset: 4n,
				});
			} finally {
				unlock.resolve();
				await holding;
				await running?.stop();
				await isolated.stop();
				await crashCustomer.cleanup();
			}
		}, 90_000);

		test("a command past the row's cycle end refills it first: the track draws from the new cycle and Postgres shows it; a check does the same", async () => {
			const worker = workers.at(-1) ?? (await startWorker({ harness }));
			if (!workers.includes(worker)) workers.push(worker);
			const DAY_MS = 24 * 60 * 60 * 1000;
			const cycleEndedAt = Date.now() - DAY_MS;
			const tracked = await seedCustomer({
				postgres,
				balance: 60,
				allowance: 100,
				nextResetAt: cycleEndedAt,
			});
			const checked = await seedCustomer({
				postgres,
				balance: 60,
				allowance: 100,
				nextResetAt: cycleEndedAt,
			});
			try {
				const reply = await trackOrExplain(
					harness,
					trackCommand({
						customer: tracked,
						commandId: "reset_track",
						value: 5,
					}),
				);
				expect(reply.result.status).toBe("applied");
				expect(balanceOf(reply, tracked.customerEntitlementId)).toBe(95);
				expect(await waitForBalance({ customer: tracked, balance: 95 })).toBe(
					95,
				);
				const trackedNextResetAt = await tracked.readNextResetAt();
				expect(trackedNextResetAt).toBeGreaterThan(Date.now());
				expect(trackedNextResetAt).toBeLessThanOrEqual(
					cycleEndedAt + 32 * DAY_MS,
				);

				// A retry of the track is a duplicate; the reset it triggered is not refilled twice.
				await expect(
					harness.client.track({
						command: trackCommand({
							customer: tracked,
							commandId: "reset_track",
							value: 5,
						}),
					}),
				).rejects.toMatchObject({ workerCode: "DUPLICATE_COMMAND" });
				expect(await tracked.readBalance()).toBe(95);

				// 60 on the old cycle would refuse 70; the check refills first and allows it.
				const check = await harness.client.check({
					command: checkCommand({
						customer: checked,
						requestId: "reset_check",
						requiredBalance: 70,
					}),
				});
				expect(check.result.allowed).toBe(true);
				expect(balanceOf(check, checked.customerEntitlementId)).toBe(100);
				expect(await waitForBalance({ customer: checked, balance: 100 })).toBe(
					100,
				);
				expect(await checked.readNextResetAt()).toBeGreaterThan(Date.now());
			} finally {
				await tracked.cleanup();
				await checked.cleanup();
			}
		}, 60_000);

		test("a reset on an edge date reads the subscription's anchor from Postgres and lands on the anchor's cycle end", async () => {
			const worker = workers.at(-1) ?? (await startWorker({ harness }));
			if (!workers.includes(worker)) workers.push(worker);
			const utc = (year: number, month: number, day: number) =>
				Date.UTC(year, month - 1, day);
			// A month-end subscription drifted to the 30th: stepping alone would give 30 May; the anchor bills 31 May.
			const anchored = await seedCustomer({
				postgres,
				balance: 60,
				allowance: 100,
				nextResetAt: utc(2027, 4, 30),
				billingCycleAnchor: utc(2027, 1, 31),
			});
			try {
				const reply = await trackOrExplain(
					harness,
					trackCommand({
						customer: anchored,
						commandId: "anchored_track",
						value: 5,
						occurredAt: utc(2027, 5, 1),
					}),
				);
				expect(balanceOf(reply, anchored.customerEntitlementId)).toBe(95);
				expect(await waitForBalance({ customer: anchored, balance: 95 })).toBe(
					95,
				);
				expect(await anchored.readNextResetAt()).toBe(utc(2027, 5, 31));
			} finally {
				await anchored.cleanup();
			}
		}, 60_000);

		test("an explicit reset refills a due row and lands it; nothing due writes nothing; a queued reset is consumed the same way", async () => {
			const worker = workers.at(-1) ?? (await startWorker({ harness }));
			if (!workers.includes(worker)) workers.push(worker);
			const DAY_MS = 24 * 60 * 60 * 1000;
			const sent = await seedCustomer({
				postgres,
				balance: 60,
				allowance: 100,
				nextResetAt: Date.now() - DAY_MS,
			});
			const queued = await seedCustomer({
				postgres,
				balance: 60,
				allowance: 100,
				nextResetAt: Date.now() - DAY_MS,
			});
			try {
				const refilled = await harness.client.reset({
					command: resetCommand({ customer: sent, commandId: "reset_1" }),
				});
				expect(
					refilled.result?.rows.map((row) => row.customerEntitlementId),
				).toEqual([sent.customerEntitlementId]);
				expect(await waitForBalance({ customer: sent, balance: 100 })).toBe(
					100,
				);
				expect(await sent.readNextResetAt()).toBeGreaterThan(Date.now());
				const bookmark = await sent.readNextOffset({
					topic: harness.topics.metering,
					partition: PARTITION,
				});

				// Already on the new cycle: a later reset finds nothing due and appends no record.
				const idle = await harness.client.reset({
					command: resetCommand({ customer: sent, commandId: "reset_2" }),
				});
				expect(idle.result).toBeNull();
				expect(
					await sent.readNextOffset({
						topic: harness.topics.metering,
						partition: PARTITION,
					}),
				).toBe(bookmark);

				// The cron's path: queued on the command topic, consumed by the owner, landed the same way.
				await harness.client.queue.reset({
					commands: [
						resetCommand({ customer: queued, commandId: "reset_queued" }),
					],
				});
				expect(await waitForBalance({ customer: queued, balance: 100 })).toBe(
					100,
				);
				expect(await queued.readNextResetAt()).toBeGreaterThan(Date.now());
			} finally {
				await sent.cleanup();
				await queued.cleanup();
			}
		}, 60_000);

		test("a reset carries the unused balance over as a rollover row and the next track draws it down", async () => {
			const worker = workers.at(-1) ?? (await startWorker({ harness }));
			if (!workers.includes(worker)) workers.push(worker);
			const DAY_MS = 24 * 60 * 60 * 1000;
			const carried = await seedCustomer({
				postgres,
				balance: 60,
				allowance: 100,
				nextResetAt: Date.now() - DAY_MS,
				rolloverMax: 50,
			});
			try {
				const refilled = await harness.client.reset({
					command: resetCommand({
						customer: carried,
						commandId: "carry_reset",
					}),
				});
				expect(refilled.result?.rows).toHaveLength(1);
				expect(await waitForBalance({ customer: carried, balance: 100 })).toBe(
					100,
				);
				// 60 unused, capped at 50, expiring a month after the cycle that ended.
				expect(await carried.readRollovers()).toEqual([
					{ balance: 50, expires_at: expect.any(Number) },
				]);

				const reply = await trackOrExplain(
					harness,
					trackCommand({
						customer: carried,
						commandId: "carry_track",
						value: 5,
					}),
				);
				expect(reply.result.status).toBe("applied");
				// One of the two paid the 5; which one is the deduction order's call, not this test's.
				let held = 0;
				for (let attempt = 0; attempt < 200 && held !== 145; attempt++) {
					const [rollover] = await carried.readRollovers();
					held = (rollover?.balance ?? 0) + (await carried.readBalance());
					if (held !== 145) await Bun.sleep(50);
				}
				expect(held).toBe(145);
			} finally {
				await carried.cleanup();
			}
		}, 60_000);

		test("a due pool promotes its contributions in Postgres, refills from the promoted grant, and lands the pool row with it", async () => {
			const worker = workers.at(-1) ?? (await startWorker({ harness }));
			if (!workers.includes(worker)) workers.push(worker);
			const DAY_MS = 24 * 60 * 60 * 1000;
			const cycleEndedAt = Date.now() - DAY_MS;
			const owner = await seedCustomer({ postgres, balance: 100 });
			// A: unchanged. B: a downgrade due at the cycle end. C: added mid-cycle, contributing from the next one.
			const pool = await seedPool({
				postgres,
				customer: owner,
				granted: 150,
				balance: 20,
				nextResetAt: cycleEndedAt,
				contributions: [
					{ current: 100, next: 100, effectiveAt: null },
					{ current: 50, next: 40, effectiveAt: cycleEndedAt },
					{ current: 0, next: 30, effectiveAt: cycleEndedAt },
				],
			});
			try {
				const reply = await trackOrExplain(
					harness,
					trackCommand({ customer: owner, commandId: "pool_track", value: 5 }),
				);
				expect(reply.result.status).toBe("applied");
				// The pool paid: 100 + 40 + 30 = 170, less the 5.
				expect(balanceOf(reply, pool.poolCustomerEntitlementId)).toBe(165);

				let landed = false;
				for (let attempt = 0; attempt < 200 && !landed; attempt++) {
					landed = (await pool.readBalance()) === 165;
					if (!landed) await Bun.sleep(50);
				}
				expect(await pool.readBalance()).toBe(165);
				expect(await pool.readGranted()).toBe(170);
				expect(await pool.readNextResetAt()).toBeGreaterThan(Date.now());
				expect(
					(await pool.readContributions()).map(({ current, effective_at }) => [
						current,
						effective_at,
					]),
				).toEqual([
					[100, null],
					[40, null],
					[30, null],
				]);
			} finally {
				await pool.cleanup();
				await owner.cleanup();
			}
		}, 60_000);

		test("two tracks and a check arriving together at the cycle end refill the row exactly once", async () => {
			const worker = workers.at(-1) ?? (await startWorker({ harness }));
			if (!workers.includes(worker)) workers.push(worker);
			const DAY_MS = 24 * 60 * 60 * 1000;
			const crowded = await seedCustomer({
				postgres,
				balance: 60,
				allowance: 100,
				nextResetAt: Date.now() - DAY_MS,
			});
			try {
				const [first, second, check] = await Promise.all([
					trackOrExplain(
						harness,
						trackCommand({ customer: crowded, commandId: "crowd_1", value: 5 }),
					),
					trackOrExplain(
						harness,
						trackCommand({ customer: crowded, commandId: "crowd_2", value: 5 }),
					),
					harness.client.check({
						command: checkCommand({
							customer: crowded,
							requestId: "crowd_check",
							requiredBalance: 70,
						}),
					}),
				]);
				expect(first.result.status).toBe("applied");
				expect(second.result.status).toBe("applied");
				// 60 on the old cycle would have refused 70: every arrival saw the refilled cycle.
				expect(check.result.allowed).toBe(true);
				// One refill to 100, then 5 and 5: a second refill would leave 95 or 100.
				expect(await waitForBalance({ customer: crowded, balance: 90 })).toBe(
					90,
				);
				expect(await crowded.readNextResetAt()).toBeGreaterThan(Date.now());
			} finally {
				await crowded.cleanup();
			}
		}, 60_000);

		test("a row deleted underneath a decision is refused by the store alone: the log-durable caller is answered, the bookmark moves past it, the next track re-hydrates, a restart replays it as settled", async () => {
			const worker = workers.at(-1) ?? (await startWorker({ harness }));
			if (!workers.includes(worker)) workers.push(worker);
			const moved = await seedCustomer({ postgres, balance: 100 });
			try {
				const first = await trackOrExplain(
					harness,
					trackCommand({ customer: moved, commandId: "moved_1", value: 5 }),
				);
				expect(balanceOf(first, moved.customerEntitlementId)).toBe(95);
				// Landed, so the bookmark read next is the one moved_2's skip has to pass.
				expect(await waitForBalance({ customer: moved, balance: 95 })).toBe(95);
				const bookmarkBefore = await moved.readNextOffset({
					topic: harness.topics.metering,
					partition: PARTITION,
				});

				// The legacy path removes the row without telling the worker, as a customer delete does.
				await moved.deleteGrant();

				// A log-durable caller is answered from memory once Kafka has the record; the store's refusal is an accepted loss.
				const refused = await trackOrExplain(
					harness,
					trackCommand({ customer: moved, commandId: "moved_2", value: 5 }),
				);
				expect(balanceOf(refused, moved.customerEntitlementId)).toBe(90);
				// The refused record still moved the bookmark: a replay never meets it again.
				const bookmarkAfter = await waitForBookmarkPast({
					customer: moved,
					harness,
					bookmark: bookmarkBefore,
				});
				expect(bookmarkAfter).toBeGreaterThan(bookmarkBefore as bigint);

				// The worker still owns the partition and decides the next track on fresh rows.
				await moved.restoreGrant({ balance: 50 });
				const third = await trackOrExplain(
					harness,
					trackCommand({ customer: moved, commandId: "moved_3", value: 5 }),
				);
				expect(balanceOf(third, moved.customerEntitlementId)).toBe(45);
				expect(await waitForBalance({ customer: moved, balance: 45 })).toBe(45);

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
				expect(await waitForBalance({ customer: moved, balance: 40 })).toBe(40);
			} finally {
				await moved.cleanup();
			}
		}, 90_000);
	},
);
