import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	type CheckCommand,
	parseCheckCommand,
	parseReadSubjectStateCommand,
	parseResetCommand,
	parseTrackCommand,
	type ReadSubjectStateCommand,
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
	planEntityOfCustomer,
	planNewCustomer,
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

function readSubjectStateCommand({
	customer,
	requestId,
}: {
	customer: Pick<SeededCustomer, "identity">;
	requestId: string;
}): ReadSubjectStateCommand {
	return parseReadSubjectStateCommand({
		input: {
			schemaVersion: 1,
			type: "readSubjectState",
			org: {
				config: {
					reverse_deduction_order: false,
					block_overdue_entitlements: false,
					include_past_due: true,
				},
			},
			requestId,
			identity: customer.identity,
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

		test("a read returns the whole customer and its products with every earlier track counted; a missing customer is not found", async () => {
			const worker = workers.at(-1) ?? (await startWorker({ harness }));
			if (!workers.includes(worker)) workers.push(worker);
			const read = await seedCustomer({
				postgres,
				balance: 100,
				billingCycleAnchor: Date.now(),
			});
			try {
				await trackOrExplain(
					harness,
					trackCommand({ customer: read, commandId: "read_track", value: 5 }),
				);

				const reply = await harness.client.readSubjectState({
					command: readSubjectStateCommand({
						customer: read,
						requestId: "read_whole",
					}),
				});
				expect(balanceOf(reply, read.customerEntitlementId)).toBe(95);
				expect(reply.state.customer).toMatchObject({
					id: read.identity.customerId,
					org_id: read.orgId,
					name: read.identity.customerId,
				});
				expect(reply.state.customerProducts[0]).toMatchObject({
					id: read.customerProductId,
					product_id: "pro",
					subscription_ids: [expect.stringMatching(/^sub_stripe_/)],
				});

				await expect(
					harness.client.readSubjectState({
						command: readSubjectStateCommand({
							customer: {
								identity: {
									...read.identity,
									customerId: `${read.identity.customerId}_missing`,
								},
							},
							requestId: "read_missing",
						}),
					}),
				).rejects.toMatchObject({ workerCode: "CUSTOMER_NOT_FOUND" });
			} finally {
				await read.cleanup();
			}
		}, 60_000);

		test("a billing plan that creates a customer lands every row in Postgres, arrays included, and a track then draws on it", async () => {
			const worker = workers.at(-1) ?? (await startWorker({ harness }));
			if (!workers.includes(worker)) workers.push(worker);
			const seeded = await seedCustomer({ postgres, balance: 100 });
			const planned = await planNewCustomer({ postgres, seeded });
			try {
				const reply = await harness.client.applyBillingPlan({
					request: planned.request({ commandId: "plan_create" }),
				});
				expect(reply.result.status).toBe("applied");
				expect(reply.state.customer).toMatchObject({
					id: planned.identity.customerId,
					name: "Ada",
					metadata: { plan: "team" },
				});
				expect(await planned.countCustomers()).toBe(1);
				expect(await planned.readCustomerProduct()).toEqual({
					options: [{ feature_id: seeded.featureId, quantity: 3 }],
					subscription_ids: [expect.stringMatching(/^sub_stripe_/)],
					scheduled_ids: [],
				});
				expect(await planned.readBalance()).toBe(100);

				const created = {
					...seeded,
					identity: planned.identity,
					customerEntitlementId: planned.customerEntitlementId,
					readBalance: planned.readBalance,
				};
				const tracked = await trackOrExplain(
					harness,
					trackCommand({
						customer: created,
						commandId: "plan_track",
						value: 5,
					}),
				);
				expect(tracked.result.status).toBe("applied");
				expect(await waitForBalance({ customer: created, balance: 95 })).toBe(
					95,
				);
			} finally {
				await planned.cleanup();
				await seeded.cleanup();
			}
		}, 60_000);

		test("two plans creating the same customer at once: one applies, the other finds it and writes nothing", async () => {
			const worker = workers.at(-1) ?? (await startWorker({ harness }));
			if (!workers.includes(worker)) workers.push(worker);
			const seeded = await seedCustomer({ postgres, balance: 100 });
			const planned = await planNewCustomer({ postgres, seeded });
			try {
				const replies = await Promise.all([
					harness.client.applyBillingPlan({
						request: planned.request({ commandId: "plan_race_a" }),
					}),
					harness.client.applyBillingPlan({
						request: planned.request({ commandId: "plan_race_b" }),
					}),
				]);
				expect(replies.map((reply) => reply.result.status).sort()).toEqual([
					"applied",
					"customer_exists",
				]);
				expect(await planned.countCustomers()).toBe(1);
				expect(await planned.readBalance()).toBe(100);
			} finally {
				await planned.cleanup();
				await seeded.cleanup();
			}
		}, 60_000);

		test("a plan whose row collides with one Postgres already holds is refused as stale, leaves nothing behind, and a clean retry applies", async () => {
			const worker = workers.at(-1) ?? (await startWorker({ harness }));
			if (!workers.includes(worker)) workers.push(worker);
			const seeded = await seedCustomer({ postgres, balance: 100 });
			const planned = await planNewCustomer({ postgres, seeded });
			try {
				await expect(
					harness.client.applyBillingPlan({
						request: planned.request({
							commandId: "plan_collide",
							customerProductId: seeded.customerProductId,
						}),
					}),
				).rejects.toMatchObject({ workerCode: "STALE_SUBJECT" });
				expect(await planned.countCustomers()).toBe(0);

				const retried = await harness.client.applyBillingPlan({
					request: planned.request({ commandId: "plan_collide_retry" }),
				});
				expect(retried.result.status).toBe("applied");
				expect(await planned.countCustomers()).toBe(1);
			} finally {
				await planned.cleanup();
				await seeded.cleanup();
			}
		}, 60_000);

		test("a plan's updates land on the customer and its product in Postgres, and the worker serves them", async () => {
			const worker = workers.at(-1) ?? (await startWorker({ harness }));
			if (!workers.includes(worker)) workers.push(worker);
			const seeded = await seedCustomer({ postgres, balance: 100 });
			const planned = await planNewCustomer({ postgres, seeded });
			try {
				await harness.client.applyBillingPlan({
					request: planned.request({ commandId: "plan_update_create" }),
				});
				const linked = await harness.client.applyBillingPlan({
					request: planned.linkBackRequest({ commandId: "plan_update_link" }),
				});
				expect(linked.result.status).toBe("applied");

				const stripeCustomer = {
					id: expect.stringMatching(/^cus_stripe_/),
					type: "stripe",
				};
				expect(await planned.readProcessor()).toEqual(stripeCustomer);
				expect(await planned.readCustomerProduct()).toEqual({
					options: [{ feature_id: seeded.featureId, quantity: 3 }],
					subscription_ids: [expect.stringMatching(/^sub_linked_/)],
					scheduled_ids: [expect.stringMatching(/^sched_linked_/)],
				});
				const read = await harness.client.readSubjectState({
					command: readSubjectStateCommand({
						customer: planned,
						requestId: "plan_update_read",
					}),
				});
				expect(read.state.customer.processor).toEqual(stripeCustomer);
				expect(read.state.customerProducts[0]?.subscription_ids).toEqual([
					expect.stringMatching(/^sub_linked_/),
				]);
			} finally {
				await planned.cleanup();
				await seeded.cleanup();
			}
		}, 60_000);

		test("an update overwrites a column another writer changed behind the worker: last write wins, as on the Postgres lane", async () => {
			const worker = workers.at(-1) ?? (await startWorker({ harness }));
			if (!workers.includes(worker)) workers.push(worker);
			const seeded = await seedCustomer({ postgres, balance: 100 });
			const planned = await planNewCustomer({ postgres, seeded });
			try {
				await harness.client.applyBillingPlan({
					request: planned.request({ commandId: "plan_overwrite_create" }),
				});
				await planned.writeSubscriptionIdsBehindWorker(["sub_other_writer"]);

				const linked = await harness.client.applyBillingPlan({
					request: planned.linkBackRequest({
						commandId: "plan_overwrite_link",
					}),
				});
				expect(linked.result.status).toBe("applied");
				expect(await planned.readCustomerProduct()).toMatchObject({
					subscription_ids: [expect.stringMatching(/^sub_linked_/)],
				});
				expect(await planned.readProcessor()).toMatchObject({
					type: "stripe",
				});
			} finally {
				await planned.cleanup();
				await seeded.cleanup();
			}
		}, 60_000);

		test("an update of a product the worker does not hold is refused as stale before anything is logged", async () => {
			const worker = workers.at(-1) ?? (await startWorker({ harness }));
			if (!workers.includes(worker)) workers.push(worker);
			const seeded = await seedCustomer({ postgres, balance: 100 });
			const planned = await planNewCustomer({ postgres, seeded });
			try {
				await harness.client.applyBillingPlan({
					request: planned.request({ commandId: "plan_missing_create" }),
				});
				await expect(
					harness.client.applyBillingPlan({
						request: planned.linkBackRequest({
							commandId: "plan_missing_link",
							customerProductId: "cp_not_held",
						}),
					}),
				).rejects.toMatchObject({ workerCode: "STALE_SUBJECT" });
				expect(await planned.readProcessor()).toBeNull();
			} finally {
				await planned.cleanup();
				await seeded.cleanup();
			}
		}, 60_000);

		test("a plan update of a row another writer deleted is refused by the store alone: the caller hears it, the bookmark moves past it, the partition keeps deciding, and a restart replays it as settled", async () => {
			const worker = workers.at(-1) ?? (await startWorker({ harness }));
			if (!workers.includes(worker)) workers.push(worker);
			const seeded = await seedCustomer({ postgres, balance: 100 });
			const planned = await planNewCustomer({ postgres, seeded });
			try {
				await harness.client.applyBillingPlan({
					request: planned.request({ commandId: "poison_create" }),
				});
				const bookmarkBefore = await seeded.readNextOffset({
					topic: harness.topics.metering,
					partition: PARTITION,
				});

				// The worker still holds the product, so it decides the update; Postgres has nothing to update.
				await planned.deleteCustomerProductBehindWorker();
				await expect(
					harness.client.applyBillingPlan({
						request: planned.linkBackRequest({ commandId: "poison_link" }),
					}),
				).rejects.toMatchObject({ workerCode: "STALE_SUBJECT" });
				// One record, one verdict: its customer update did not land either.
				expect(await planned.readProcessor()).toBeNull();
				const bookmarkAfter = await waitForBookmarkPast({
					customer: seeded,
					harness,
					bookmark: bookmarkBefore,
				});
				expect(bookmarkAfter).toBeGreaterThan(bookmarkBefore as bigint);
				// The refused record is in the log, so its id is spent even though nothing landed.
				await expect(
					harness.client.applyBillingPlan({
						request: planned.linkBackRequest({ commandId: "poison_link" }),
					}),
				).rejects.toMatchObject({ workerCode: "DUPLICATE_COMMAND" });

				// The partition keeps deciding and landing plans for this customer.
				const renamed = await harness.client.applyBillingPlan({
					request: planned.renameRequest({
						commandId: "poison_rename",
						name: "Grace",
					}),
				});
				expect(renamed.result.status).toBe("applied");
				expect(await planned.readName()).toBe("Grace");

				// A restart replays the log past the refused record without tripping on it.
				await worker.stop();
				workers.splice(workers.indexOf(worker), 1);
				const replacement = await startWorker({ harness });
				workers.push(replacement);
				const renamedAgain = await harness.client.applyBillingPlan({
					request: planned.renameRequest({
						commandId: "poison_rename_after_restart",
						name: "Hopper",
					}),
				});
				expect(renamedAgain.result.status).toBe("applied");
				expect(await planned.readName()).toBe("Hopper");
			} finally {
				await planned.cleanup();
				await seeded.cleanup();
			}
		}, 90_000);

		test("one plan over the customer and an entity lands both, and each subject's memory holds only its own rows", async () => {
			const worker = workers.at(-1) ?? (await startWorker({ harness }));
			if (!workers.includes(worker)) workers.push(worker);
			const seeded = await seedCustomer({ postgres, balance: 100 });
			const planned = await planNewCustomer({ postgres, seeded });
			try {
				await harness.client.applyBillingPlan({
					request: planned.request({ commandId: "entity_plan_create" }),
				});
				const entity = await planEntityOfCustomer({
					postgres,
					seeded,
					planned,
				});
				try {
					const reply = await harness.client.applyBillingPlan({
						request: entity.request({ commandId: "entity_plan_apply" }),
					});
					expect(reply.result.status).toBe("applied");
					expect(await planned.readName()).toBe("Grace");
					expect(await entity.readEntityGrantBalance()).toBe(20);

					const customerRead = await harness.client.readSubjectState({
						command: readSubjectStateCommand({
							customer: planned,
							requestId: "entity_plan_read_customer",
						}),
					});
					expect(customerRead.state.customer.name).toBe("Grace");
					expect(
						customerRead.state.customerProducts.map((row) => row.id),
					).not.toContain(entity.customerProductId);

					const entityRead = await harness.client.readSubjectState({
						command: readSubjectStateCommand({
							customer: { identity: entity.identity },
							requestId: "entity_plan_read_entity",
						}),
					});
					expect(
						entityRead.state.customerProducts.map((row) => row.id),
					).toContain(entity.customerProductId);
					expect(
						entityRead.state.customerEntitlements.find(
							(row) => row.id === entity.customerEntitlementId,
						)?.balance,
					).toBe(20);
				} finally {
					await entity.cleanup();
				}
			} finally {
				await planned.cleanup();
				await seeded.cleanup();
			}
		}, 60_000);

		test("a plan over the customer and an entity is one verdict: an entity row that collides refuses the customer's change too", async () => {
			const worker = workers.at(-1) ?? (await startWorker({ harness }));
			if (!workers.includes(worker)) workers.push(worker);
			const seeded = await seedCustomer({ postgres, balance: 100 });
			const planned = await planNewCustomer({ postgres, seeded });
			try {
				await harness.client.applyBillingPlan({
					request: planned.request({ commandId: "entity_atomic_create" }),
				});
				const entity = await planEntityOfCustomer({
					postgres,
					seeded,
					planned,
				});
				try {
					await expect(
						harness.client.applyBillingPlan({
							request: entity.request({
								commandId: "entity_atomic_collide",
								customerProductId: seeded.customerProductId,
							}),
						}),
					).rejects.toMatchObject({ workerCode: "STALE_SUBJECT" });
					expect(await planned.readName()).toBe("Ada");
					expect(await entity.readEntityGrantBalance()).toBeNull();
				} finally {
					await entity.cleanup();
				}
			} finally {
				await planned.cleanup();
				await seeded.cleanup();
			}
		}, 60_000);

		test("a plan naming an entity the customer does not have is refused before anything is logged", async () => {
			const worker = workers.at(-1) ?? (await startWorker({ harness }));
			if (!workers.includes(worker)) workers.push(worker);
			const seeded = await seedCustomer({ postgres, balance: 100 });
			const planned = await planNewCustomer({ postgres, seeded });
			try {
				await harness.client.applyBillingPlan({
					request: planned.request({ commandId: "entity_missing_create" }),
				});
				const entity = await planEntityOfCustomer({
					postgres,
					seeded,
					planned,
				});
				try {
					await expect(
						harness.client.applyBillingPlan({
							request: entity.request({
								commandId: "entity_missing_apply",
								entityId: "ent_not_there",
							}),
						}),
					).rejects.toMatchObject({ workerCode: "ENTITY_NOT_FOUND" });
					expect(await planned.readName()).toBe("Ada");
				} finally {
					await entity.cleanup();
				}
			} finally {
				await planned.cleanup();
				await seeded.cleanup();
			}
		}, 60_000);

		test("a plan deletes a product: its grant goes with it in Postgres and in the worker's memory", async () => {
			const worker = workers.at(-1) ?? (await startWorker({ harness }));
			if (!workers.includes(worker)) workers.push(worker);
			const seeded = await seedCustomer({ postgres, balance: 100 });
			const planned = await planNewCustomer({ postgres, seeded });
			try {
				await harness.client.applyBillingPlan({
					request: planned.request({ commandId: "delete_create" }),
				});
				const deleted = await harness.client.applyBillingPlan({
					request: planned.opsRequest({
						commandId: "delete_product",
						ops: [
							{
								op: "delete",
								table: "customerProducts",
								id: planned.customerProductId,
							},
						],
					}),
				});
				expect(deleted.result.status).toBe("applied");
				expect(deleted.state.customerProducts).toEqual([]);
				expect(deleted.state.customerEntitlements).toEqual([]);
				expect(await planned.readCustomerProduct()).toBeNull();
				expect(Number.isNaN(await planned.readBalance())).toBe(true);
			} finally {
				await planned.cleanup();
				await seeded.cleanup();
			}
		}, 60_000);

		test("a plan moves a grant: an update replaces its reset date, an increment adds to the balance a track left", async () => {
			const worker = workers.at(-1) ?? (await startWorker({ harness }));
			if (!workers.includes(worker)) workers.push(worker);
			const seeded = await seedCustomer({ postgres, balance: 100 });
			const planned = await planNewCustomer({ postgres, seeded });
			try {
				await harness.client.applyBillingPlan({
					request: planned.request({ commandId: "grant_create" }),
				});
				const created = {
					...seeded,
					identity: planned.identity,
					customerEntitlementId: planned.customerEntitlementId,
					readBalance: planned.readBalance,
				};
				await trackOrExplain(
					harness,
					trackCommand({
						customer: created,
						commandId: "grant_track",
						value: 5,
					}),
				);
				const nextResetAt = Date.now() + 86_400_000;
				const moved = await harness.client.applyBillingPlan({
					request: planned.opsRequest({
						commandId: "grant_move",
						ops: [
							{
								op: "update",
								table: "customerEntitlements",
								id: planned.customerEntitlementId,
								set: { next_reset_at: nextResetAt },
							},
							{
								op: "increment",
								table: "customerEntitlements",
								id: planned.customerEntitlementId,
								add: { balance: 25 },
							},
						],
					}),
				});
				expect(moved.result.status).toBe("applied");
				expect(await planned.readBalance()).toBe(120);
				expect(
					moved.state.customerEntitlements.find(
						({ id }) => id === planned.customerEntitlementId,
					),
				).toMatchObject({ balance: 120, next_reset_at: nextResetAt });
			} finally {
				await planned.cleanup();
				await seeded.cleanup();
			}
		}, 60_000);

		test("a plan creates an entity with a product on it; Postgres holds both and the entity's read serves them", async () => {
			const worker = workers.at(-1) ?? (await startWorker({ harness }));
			if (!workers.includes(worker)) workers.push(worker);
			const seeded = await seedCustomer({ postgres, balance: 100 });
			const planned = await planNewCustomer({ postgres, seeded });
			try {
				const createOps = planned.request({ commandId: "entity_new_create" })
					.command.ops;
				await harness.client.applyBillingPlan({
					request: planned.request({ commandId: "entity_new_create" }),
				});
				const [productRow] = createOps.flatMap((op) =>
					op.op === "insert" && op.table === "customerProducts" ? [op.row] : [],
				);
				if (!productRow) throw new Error("The created plan has no product");
				const entity = {
					id: "seat_new",
					internal_id: `ent_int_${planned.internalCustomerId}`,
					internal_customer_id: planned.internalCustomerId,
					org_id: seeded.orgId,
					env: seeded.env,
					created_at: Date.now(),
					name: "New seat",
					deleted: false,
					feature_id: seeded.featureId,
					internal_feature_id: seeded.internalFeatureId,
				};
				const entityProductId = `cp_new_seat_${planned.internalCustomerId}`;
				const reply = await harness.client.applyBillingPlan({
					request: planned.opsRequest({
						commandId: "entity_new_apply",
						entityIds: [entity.id],
						ops: [
							{ op: "insert", table: "entity", row: entity },
							{
								op: "insert",
								table: "customerProducts",
								row: {
									...productRow,
									id: entityProductId,
									internal_entity_id: entity.internal_id,
									entity_id: entity.id,
								},
							},
						],
					}),
				});
				expect(reply.result.status).toBe("applied");
				expect(await planned.readEntity(entity.id)).toMatchObject({
					name: "New seat",
				});

				const entityRead = await harness.client.readSubjectState({
					command: readSubjectStateCommand({
						customer: {
							identity: { ...planned.identity, entityId: entity.id },
						},
						requestId: "entity_new_read",
					}),
				});
				expect(entityRead.state.entity?.id).toBe(entity.id);
				expect(entityRead.state.customerProducts.map(({ id }) => id)).toContain(
					entityProductId,
				);
			} finally {
				await planned.cleanup();
				await seeded.cleanup();
			}
		}, 60_000);

		test("a currency lock sets the currency once; a second lock leaves it", async () => {
			const worker = workers.at(-1) ?? (await startWorker({ harness }));
			if (!workers.includes(worker)) workers.push(worker);
			const seeded = await seedCustomer({ postgres, balance: 100 });
			const planned = await planNewCustomer({ postgres, seeded });
			try {
				await harness.client.applyBillingPlan({
					request: planned.request({ commandId: "currency_create" }),
				});
				const lock = ({
					commandId,
					currency,
				}: {
					commandId: string;
					currency: string;
				}) =>
					harness.client.applyBillingPlan({
						request: planned.opsRequest({
							commandId,
							ops: [
								{
									op: "update",
									table: "customer",
									id: planned.internalCustomerId,
									set: { currency },
									whereUnset: true,
								},
							],
						}),
					});
				await lock({ commandId: "currency_usd", currency: "usd" });
				await lock({ commandId: "currency_eur", currency: "eur" });
				expect(await planned.readCurrency()).toBe("usd");
			} finally {
				await planned.cleanup();
				await seeded.cleanup();
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
