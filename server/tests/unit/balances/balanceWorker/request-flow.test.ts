import { expect, test } from "bun:test";
import type { InitializeCommand } from "@autumn/balance-engine";
import {
	type BalanceWorkerClient,
	BalanceWorkerClientError,
} from "@autumn/balance-worker-client";
import {
	ApiVersion,
	ApiVersionClass,
	type CheckParams,
	type TrackParams,
} from "@autumn/shared";
import { initializeBalanceWorkerCustomer } from "@/internal/balances/balanceWorker/initializeBalanceWorkerCustomer.js";
import { runBalanceWorkerCheck } from "@/internal/balances/check/balanceWorker/runBalanceWorkerCheck.js";
import { runBalanceWorkerTrack } from "@/internal/balances/track/balanceWorker/runBalanceWorkerTrack.js";
import { createCustomerFixture } from "./customer-fixture.js";

test.concurrent(
	"initialization sends the exact mapped baseline through the owner client and preserves each decision",
	async () => {
		const fixture = createCustomerFixture();
		const commands: InitializeCommand[] = [];
		for (const kind of [
			"initialized",
			"duplicate",
			"already_initialized",
		] as const) {
			const client: Pick<BalanceWorkerClient, "initialize"> = {
				initialize: async ({ command }) => {
					commands.push(command);
					return kind === "already_initialized"
						? { kind }
						: { kind, state: command.state };
				},
			};
			expect(
				await initializeBalanceWorkerCustomer({
					...fixture,
					featureIds: ["messages"],
					initializationId: "baseline",
					client,
				}),
			).toMatchObject({ kind });
		}
		expect(commands[0]).toMatchObject({
			type: "initialize",
			requestId: fixture.ctx.id,
			initializationId: "baseline",
			identity: { customerId: "cus_test" },
			state: {
				revision: 0,
				featureStatesById: {
					messages: {
						customerEntitlements: [{ granted: 110, balance: 72, usage: 38 }],
					},
				},
			},
		});
		expect(commands[1]).toEqual(commands[0]);
		expect(commands[2]).toEqual(commands[0]);
	},
);

test.concurrent(
	"initialization rejects negative raw balances before submission but accepts zero",
	async () => {
		const fixture = createCustomerFixture();
		const commands: InitializeCommand[] = [];
		const client: Pick<BalanceWorkerClient, "initialize"> = {
			initialize: async ({ command }) => {
				commands.push(command);
				return { kind: "initialized", state: command.state };
			},
		};
		const initialization = {
			...fixture,
			featureIds: ["messages"],
			initializationId: "baseline",
			client,
		};
		// Public remaining clamps negatives to zero; initialization must inspect the raw balance.
		for (const balance of [-5, -0.25]) {
			fixture.customerEntitlement.balance = balance;
			await expect(
				initializeBalanceWorkerCustomer(initialization),
			).rejects.toMatchObject({
				code: "invalid_request",
				statusCode: 400,
				data: { reason: "negative_balance_not_supported" },
			});
		}
		expect(commands).toHaveLength(0);

		fixture.customerEntitlement.balance = 0;
		expect(await initializeBalanceWorkerCustomer(initialization)).toMatchObject(
			{
				kind: "initialized",
				state: {
					featureStatesById: {
						messages: {
							customerEntitlements: [{ balance: 0, granted: 110, usage: 110 }],
						},
					},
				},
			},
		);
		expect(commands).toHaveLength(1);
	},
);

test.concurrent(
	"check maps the committed snapshot, request defaults and legacy API responses without reading the customer",
	async () => {
		const { ctx } = createCustomerFixture();
		const commands: unknown[] = [];
		const client: Pick<BalanceWorkerClient, "check"> = {
			check: async ({ command }) => {
				commands.push(command);
				return {
					kind: "decided",
					allowed: false,
					reason: "insufficient_balance",
					balance: 0,
					requiredBalance: command.requiredBalance,
					revision: 9,
					balanceSnapshot: {
						id: "internal_grant",
						externalId: "public_grant",
						balance: -2,
						usage: 112,
						granted: 110,
						planId: "pro",
						reset: {
							interval: "month",
							intervalCount: 2,
							nextResetAt: 1_800_000_000_000,
						},
						expiresAt: null,
					},
				};
			},
		};
		const body: CheckParams = {
			customer_id: "cus_test",
			feature_id: "messages",
		};
		const checked = await runBalanceWorkerCheck({ ctx, body, client });
		expect(checked).toMatchObject({
			customer_id: "cus_test",
			allowed: false,
			required_balance: 1,
			flag: null,
			balance: {
				granted: 110,
				remaining: 0,
				usage: 112,
				unlimited: false,
				overage_allowed: false,
				max_purchase: null,
				next_reset_at: 1_800_000_000_000,
				breakdown: [
					{
						id: "public_grant",
						remaining: -2,
						reset: {
							interval: "month",
							interval_count: 2,
							resets_at: 1_800_000_000_000,
						},
					},
				],
			},
		});
		expect(commands[0]).toMatchObject({
			type: "check",
			requestId: ctx.id,
			identity: { orgId: ctx.org.id, env: "sandbox", customerId: "cus_test" },
			requiredBalance: 1,
		});
		ctx.apiVersion = new ApiVersionClass(ApiVersion.V2_0);
		expect(
			await runBalanceWorkerCheck({
				ctx,
				body: { ...body, required_quantity: 3 },
				client,
			}),
		).toMatchObject({
			required_balance: 3,
			balance: {
				current_balance: 0,
				granted_balance: 110,
				usage: 112,
				plan_id: "pro",
			},
		});
		ctx.apiVersion = new ApiVersionClass(ApiVersion.V1_Beta);
		expect(await runBalanceWorkerCheck({ ctx, body, client })).toMatchObject({
			allowed: false,
			feature_id: "messages",
			balance: -2,
			required_balance: 1,
		});
	},
);

test.concurrent(
	"check refuses unsupported request semantics before calling the owner",
	async () => {
		const { ctx } = createCustomerFixture();
		let calls = 0;
		const client: Pick<BalanceWorkerClient, "check"> = {
			check: async () => {
				calls++;
				throw new Error("Unexpected check");
			},
		};
		const variants: Partial<CheckParams>[] = [
			{ product_id: "pro", feature_id: undefined },
			{ send_event: true },
			{ with_preview: true },
			{ lock: { enabled: true, lock_id: "hold" } },
			{ properties: { model: "model" } },
			{ entity_id: "entity" },
			{ customer_data: { name: "new name" } },
			{ entity_data: { feature_id: "seats", name: "entity name" } },
		];
		for (const variant of variants)
			await expect(
				runBalanceWorkerCheck({
					ctx,
					body: { customer_id: "cus_test", feature_id: "messages", ...variant },
					client,
				}),
			).rejects.toMatchObject({ code: "invalid_request", statusCode: 400 });
		ctx.expand = ["balance.feature"];
		await expect(
			runBalanceWorkerCheck({
				ctx,
				body: { customer_id: "cus_test", feature_id: "messages" },
				client,
			}),
		).rejects.toMatchObject({ data: { reason: "expand_not_supported" } });
		expect(calls).toBe(0);
	},
);

test.concurrent(
	"missing initialization is explicit and transport ambiguity never falls back",
	async () => {
		const fixture = createCustomerFixture();
		const missing = new BalanceWorkerClientError({
			code: "WORKER_ERROR",
			workerCode: "NOT_INITIALIZED",
			outcome: "not_submitted",
			message: "Customer must be initialized",
		});
		const failure = new Error("Unknown committed result");
		for (const cause of [missing, failure]) {
			const client: BalanceWorkerClient = {
				initialize: async () => {
					throw cause;
				},
				check: async () => {
					throw cause;
				},
				track: async () => {
					throw cause;
				},
			};
			const body: TrackParams = {
				customer_id: "cus_test",
				feature_id: "messages",
				value: 5,
			};
			const operations = [
				() => runBalanceWorkerCheck({ ctx: fixture.ctx, body, client }),
				() => runBalanceWorkerTrack({ ctx: fixture.ctx, body, client }),
				() =>
					initializeBalanceWorkerCustomer({
						...fixture,
						featureIds: ["messages"],
						initializationId: "baseline",
						client,
					}),
			];
			for (const operation of operations) {
				if (cause === missing)
					await expect(operation()).rejects.toMatchObject({
						code: "balance_worker_not_initialized",
						statusCode: 409,
					});
				else await expect(operation()).rejects.toBe(cause);
			}
		}
	},
);

test.concurrent(
	"track refuses semantics the worker cannot execute rather than discarding them",
	async () => {
		const { ctx } = createCustomerFixture();
		let calls = 0;
		const client: Pick<BalanceWorkerClient, "track"> = {
			track: async () => {
				calls++;
				throw new Error("Unexpected track");
			},
		};
		const variants: Partial<TrackParams>[] = [
			{ feature_id: undefined, event_name: "event" },
			{ entity_id: "entity" },
			{ properties: { model: "model" } },
			{ lock: { enabled: true, lock_id: "hold" } },
			{ customer_data: { name: "new name" } },
		];
		for (const variant of variants)
			await expect(
				runBalanceWorkerTrack({
					ctx,
					body: { customer_id: "cus_test", feature_id: "messages", ...variant },
					client,
				}),
			).rejects.toMatchObject({ code: "invalid_request", statusCode: 400 });
		expect(calls).toBe(0);
	},
);
