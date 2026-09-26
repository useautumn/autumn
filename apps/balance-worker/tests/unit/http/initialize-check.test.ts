import { expect, test } from "bun:test";
import {
	createSubjectState,
	parseCheckCommand,
	parseDeleteBalanceCommand,
	parseTrackCommand,
	parseUpdateBalanceCommand,
} from "@autumn/balance-engine";
import type { MeteringRecord } from "@autumn/kafka";
import { createBalanceWorkerApp } from "../../../src/http/createBalanceWorkerApp.js";
import type { BalanceWorkerRequestContext } from "../../../src/http/types/balanceWorkerHttp.js";
import { createPartitionProcessor } from "../../../src/processor/createPartitionProcessor.js";
import { createRecentCommands } from "../../../src/processor/writer/recentCommands/createRecentCommands.js";
import { OwnedPartitionNotReadyError } from "../../../src/runtime/runtimeErrors.js";
import { openStateStore } from "../../../src/state/openStateStore.js";
import {
	createSyntheticWorkerDb,
	createTestCatalogCache,
} from "../../fixtures/catalog.js";
import {
	createCatalogRowsFor,
	createCustomerEntitlement,
} from "../../fixtures/mutations.js";

const identity = {
	orgId: "org",
	env: "sandbox",
	customerId: "external_customer",
	entityId: null,
};
const state = createSubjectState({
	identity,
	customerEntitlements: [
		createCustomerEntitlement({
			id: "grant",
			featureId: "messages",
			balance: 10,
		}),
	],
});
const initialization = {
	command: {
		schemaVersion: 1,
		type: "initialize",
		requestId: "initialize",
		commandId: "baseline",
		identity,
		occurredAt: 1_700_000_000_000,
	},
	state,
	catalogRows: createCatalogRowsFor({ state }),
};
const checkCommand = parseCheckCommand({
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
		requestId: "check",
		identity,
		featureId: "messages",
		internalFeatureId: "feat_messages",
		requiredBalance: 5,
		properties: null,
		occurredAt: 1_700_000_000_000,
	},
});
const trackCommand = parseTrackCommand({
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
		requestId: "track",
		commandId: "track",
		identity,
		featureId: "messages",
		internalFeatureId: "feat_messages",
		value: 5,
		overageBehavior: "reject",
		properties: null,
		usageEvent: { name: "messages" },
		occurredAt: 1_700_000_000_000,
	},
});

const updateBalanceCommand = parseUpdateBalanceCommand({
	input: {
		schemaVersion: 1,
		type: "updateBalance",
		org: trackCommand.org,
		requestId: "update",
		commandId: "update",
		identity,
		featureId: "messages",
		internalFeatureId: "feat_messages",
		remaining: 3,
		occurredAt: 1_700_000_000_000,
	},
});

const deleteBalanceCommand = parseDeleteBalanceCommand({
	input: {
		schemaVersion: 1,
		type: "deleteBalance",
		org: trackCommand.org,
		requestId: "delete",
		commandId: "delete",
		identity,
		featureId: "messages",
		recalculate: false,
		occurredAt: 1_700_000_000_000,
	},
});

function createFixture({
	commitGate,
	ready = true,
}: {
	commitGate?: Promise<void>;
	ready?: boolean;
} = {}) {
	const store = openStateStore({ databasePath: ":memory:" });
	store.initializePartition({
		topic: "outcomes",
		partition: 0,
		nextOffset: 0n,
	});
	const batches: MeteringRecord[][] = [];
	const appending = Promise.withResolvers<void>();
	let offset = 0n;
	const processor = createPartitionProcessor({
		ctx: {
			stateStore: store,
			db: createSyntheticWorkerDb(),
			catalogCache: createTestCatalogCache(),
			appender: {
				appendCommitted: async ({ outcomes }) => {
					batches.push([...outcomes]);
					appending.resolve();
					await commitGate;
					const baseOffset = offset;
					offset += BigInt(outcomes.length);
					return { baseOffset };
				},
			},
			receiptPolicy: { retentionMs: 86_400_000, now: () => 1_700_000_000_000 },
			recentCommands: createRecentCommands({ windowMs: 600_000, now: () => 0 }),
			assertCanRead: () => undefined,
		},
		config: {
			topic: "outcomes",
			partition: 0,
			writerLimits: {
				maxBatchSize: 100,
				maxPendingCommands: 100,
				maxPendingCommandsPerCustomer: 100,
			},
		},
	});
	const process: BalanceWorkerRequestContext["runtime"]["process"] = (run) => {
		if (!ready)
			throw new OwnedPartitionNotReadyError({ status: "catching_up" });
		return run(processor);
	};
	const app = createBalanceWorkerApp({
		ctx: {
			ownership: {
				findRuntime: ({ routeEpoch }) =>
					routeEpoch === "1" ? { process } : undefined,
			},
			partitionResolver: { partitionForIdentity: () => 0 },
			logger: {
				debug: () => undefined,
				info: () => undefined,
				warn: () => undefined,
				error: () => undefined,
			},
		},
	});
	/** An initialize request is posted as its command plus a payload, the way the client does. */
	const post = async ({
		path,
		command,
		routeEpoch = "1",
	}: {
		path: string;
		command: unknown;
		routeEpoch?: string;
	}) => {
		const envelope =
			typeof command === "object" && command !== null && "state" in command
				? {
						command: Reflect.get(command, "command"),
						payload: {
							state: Reflect.get(command, "state"),
							catalogRows: Reflect.get(command, "catalogRows"),
						},
					}
				: { command };
		return app.request(`/v1/${path}`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				route: { partition: 0, routeEpoch },
				...envelope,
			}),
		});
	};
	const close = async () => {
		await processor.drain();
		store.close();
	};
	return {
		store,
		app,
		post,
		batches,
		close,
		processor,
		appending: appending.promise,
	};
}

test.concurrent(
	"initialize, track and check share committed state and durable retry identity",
	async () => {
		const fixture = createFixture();
		try {
			const initialized = await fixture.post({
				path: "initialize",
				command: initialization,
			});
			expect(initialized.status).toBe(200);
			expect(await initialized.json()).toMatchObject({
				result: { status: "initialized", duplicate: false },
				state: { revision: 1 },
			});
			const tracked = await fixture.post({
				path: "track",
				command: trackCommand,
			});
			expect(tracked.status).toBe(200);
			expect(await tracked.json()).toMatchObject({
				result: { status: "applied" },
				state: { revision: 2, customerEntitlements: [{ balance: 5 }] },
			});
			const checked = await fixture.post({
				path: "check",
				command: checkCommand,
			});
			expect(checked.status).toBe(200);
			expect(await checked.json()).toMatchObject({
				result: { allowed: true },
				state: { revision: 2, customerEntitlements: [{ balance: 5 }] },
			});

			const duplicate = await fixture.post({
				path: "initialize",
				command: {
					...initialization,
					command: { ...initialization.command, requestId: "retry" },
				},
			});
			expect(await duplicate.json()).toMatchObject({
				result: { status: "initialized", duplicate: true },
			});
			const conflict = await fixture.post({
				path: "initialize",
				command: {
					...initialization,
					state: { ...state, customerEntitlements: [] },
				},
			});
			expect(conflict.status).toBe(409);
			expect(await conflict.json()).toMatchObject({
				error: { code: "COMMAND_CONFLICT" },
			});
			const differentBaseline = await fixture.post({
				path: "initialize",
				command: {
					...initialization,
					command: { ...initialization.command, commandId: "other_baseline" },
				},
			});
			expect(await differentBaseline.json()).toMatchObject({
				result: { status: "already_initialized", duplicate: false },
				state: { revision: 2 },
			});
			const trackedAgain = await fixture.post({
				path: "track",
				command: trackCommand,
			});
			expect(await trackedAgain.json()).toMatchObject({
				result: { status: "applied" },
				state: { customerEntitlements: [{ balance: 5 }] },
			});
			expect(
				fixture.batches.flat().map((record) => record.command.type),
			).toEqual(["initialize", "track"]);
			expect(fixture.store.readState({ identity })?.revision).toBe(2);
		} finally {
			await fixture.close();
		}
	},
);

test.concurrent(
	"new request routes reject missing initialization, identity mismatch and stale ownership",
	async () => {
		const fixture = createFixture();
		try {
			for (const [path, command] of [
				["check", checkCommand],
				["track", trackCommand],
			] as const) {
				const response = await fixture.post({ path, command });
				expect(response.status).toBe(404);
				expect(await response.json()).toMatchObject({
					error: { code: "CUSTOMER_NOT_FOUND" },
				});
			}
			const mismatch = await fixture.post({
				path: "initialize",
				command: {
					...initialization,
					command: {
						...initialization.command,
						identity: { ...identity, customerId: "other" },
					},
				},
			});
			expect(mismatch.status).toBe(400);
			const nonBaseline = await fixture.post({
				path: "initialize",
				command: { ...initialization, state: { ...state, revision: 1 } },
			});
			expect(nonBaseline.status).toBe(400);
			for (const [path, command] of [
				["initialize", initialization],
				["check", checkCommand],
			] as const) {
				const response = await fixture.post({
					path,
					command,
					routeEpoch: "stale",
				});
				expect(response.status).toBe(400);
				const revoked = await fixture.post({ path, command, routeEpoch: "0" });
				expect(revoked.status).toBe(409);
				expect(await revoked.json()).toMatchObject({
					error: { code: "NOT_OWNER" },
				});
			}
			expect(fixture.batches).toHaveLength(0);
		} finally {
			await fixture.close();
		}
	},
);

test.concurrent(
	"a check answers from an accepted initialization before it commits; drain still waits",
	async () => {
		const gate = Promise.withResolvers<void>();
		const fixture = createFixture({ commitGate: gate.promise });
		try {
			const initializePromise = fixture.post({
				path: "initialize",
				command: initialization,
			});
			await fixture.appending;
			expect(fixture.batches).toHaveLength(1);
			let settled = false;
			const checkPromise = fixture
				.post({ path: "check", command: checkCommand })
				.then((response) => {
					settled = true;
					return response;
				});
			let drained = false;
			const draining = fixture.processor.drain().then(() => {
				drained = true;
			});
			expect(await (await checkPromise).json()).toMatchObject({
				result: { allowed: true },
				state: { revision: 1, customerEntitlements: [{ balance: 10 }] },
			});
			expect(settled).toBe(true);
			expect(drained).toBe(false);
			expect(fixture.store.readState({ identity })).toBeNull();
			gate.resolve();
			expect((await initializePromise).status).toBe(200);
			await draining;
		} finally {
			gate.resolve();
			await fixture.close();
		}
	},
);

test.concurrent(
	"initialize and check honor the runtime readiness gate",
	async () => {
		const fixture = createFixture({ ready: false });
		try {
			for (const [path, command] of [
				["initialize", initialization],
				["check", checkCommand],
			] as const) {
				const response = await fixture.post({ path, command });
				expect(response.status).toBe(503);
				expect(await response.json()).toMatchObject({
					error: { code: "NOT_READY" },
				});
			}
			expect(fixture.batches).toHaveLength(0);
		} finally {
			await fixture.close();
		}
	},
);

test.concurrent(
	"a private store refuses a billing plan: its rows would never reach Postgres",
	async () => {
		const fixture = createFixture();
		try {
			const response = await fixture.app.request("/v1/apply-billing-plan", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					route: { partition: 0, routeEpoch: "1" },
					command: {
						schemaVersion: 1,
						type: "applyBillingPlan",
						requestId: "plan",
						commandId: "plan",
						identity,
						occurredAt: 1_700_000_000_000,
						entityIds: [],
						ops: [
							{
								op: "insert",
								table: "customer",
								row: {
									internal_id: "cus_internal",
									id: identity.customerId,
									config: null,
									spend_limits: null,
									overage_allowed: null,
									usage_limits: null,
									usage_alerts: null,
								},
							},
						],
					},
					payload: { catalogRows: [] },
				}),
			});
			expect(response.status).toBe(400);
			expect(await response.json()).toMatchObject({
				error: {
					code: "UNSUPPORTED_COMMAND",
					reason: "billing_plan_needs_postgres_store",
				},
			});
			expect(fixture.batches).toHaveLength(0);
		} finally {
			await fixture.close();
		}
	},
);

test.concurrent(
	"check and track replies carry only the rows that fund the asked-for feature",
	async () => {
		const twoFeatureState = createSubjectState({
			identity,
			customerEntitlements: [
				createCustomerEntitlement({
					id: "grant",
					featureId: "messages",
					balance: 10,
				}),
				createCustomerEntitlement({ id: "seats_grant", featureId: "seats" }),
			],
		});
		const fixture = createFixture();
		try {
			await fixture.post({
				path: "initialize",
				command: {
					...initialization,
					state: twoFeatureState,
					catalogRows: createCatalogRowsFor({ state: twoFeatureState }),
				},
			});
			for (const [path, command] of [
				["track", trackCommand],
				["check", checkCommand],
			] as const) {
				const response = await fixture.post({ path, command });
				expect(response.status).toBe(200);
				const reply = await response.json();
				// The seats row is the customer's, but nothing about messages needs it.
				expect(
					reply.state.customerEntitlements.map((row: { id: string }) => row.id),
				).toEqual(["grant"]);
				expect(Object.keys(reply.catalog.features)).toEqual(["feat_messages"]);
				expect(Object.keys(reply.catalog.entitlements)).toEqual(["ent_grant"]);
				// What the server still reads off every reply stays.
				expect(reply.state.customer.id).toBe(identity.customerId);
				expect(reply.state.customerProducts).toEqual(
					twoFeatureState.customerProducts,
				);
			}
		} finally {
			await fixture.close();
		}
	},
);

test.concurrent(
	"update balance sets the rows to the target once, and writes nothing when they already hold it",
	async () => {
		const fixture = createFixture();
		try {
			await fixture.post({ path: "initialize", command: initialization });
			const updated = await fixture.post({
				path: "update-balance",
				command: updateBalanceCommand,
			});
			expect(updated.status).toBe(200);
			expect(await updated.json()).toMatchObject({
				result: { type: "updateBalance" },
			});
			expect(
				fixture.store.readState({ identity })?.customerEntitlements,
			).toMatchObject([{ balance: 3 }]);

			const retried = await fixture.post({
				path: "update-balance",
				command: { ...updateBalanceCommand, requestId: "retry" },
			});
			expect(await retried.json()).toMatchObject({
				result: { type: "updateBalance" },
			});
			const unchanged = await fixture.post({
				path: "update-balance",
				command: { ...updateBalanceCommand, commandId: "update_again" },
			});
			expect(await unchanged.json()).toEqual({ result: null });
			expect(
				fixture.batches.flat().map((record) => record.command.type),
			).toEqual(["initialize", "updateBalance"]);

			const missing = await fixture.post({
				path: "update-balance",
				command: {
					...updateBalanceCommand,
					commandId: "update_typo",
					customerEntitlementFilters: { balanceId: "typo" },
				},
			});
			expect(await missing.json()).toMatchObject({
				error: { code: "UNSUPPORTED_COMMAND" },
			});
		} finally {
			await fixture.close();
		}
	},
);

test.concurrent(
	"delete balance removes the grant once, and a retry is deduplicated",
	async () => {
		const fixture = createFixture();
		try {
			await fixture.post({ path: "initialize", command: initialization });
			const deleted = await fixture.post({
				path: "delete-balance",
				command: deleteBalanceCommand,
			});
			expect(deleted.status).toBe(200);
			expect(await deleted.json()).toMatchObject({
				result: { type: "deleteBalance", deletedIds: ["grant"] },
			});
			expect(
				fixture.store.readState({ identity })?.customerEntitlements,
			).toEqual([]);

			const retried = await fixture.post({
				path: "delete-balance",
				command: { ...deleteBalanceCommand, requestId: "retry" },
			});
			expect(await retried.json()).toMatchObject({
				result: { deletedIds: ["grant"] },
			});
			expect(
				fixture.batches.flat().map((record) => record.command.type),
			).toEqual(["initialize", "deleteBalance"]);
		} finally {
			await fixture.close();
		}
	},
);
