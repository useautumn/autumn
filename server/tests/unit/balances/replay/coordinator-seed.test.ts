/**
 * A source result becomes one stable initialization command. Ambiguous delivery
 * may resend that command once, while refusals and drift never partially seed.
 */
import { expect, test } from "bun:test";
import type { InitializeRequest } from "@autumn/balance-engine";
import { BalanceWorkerClientError } from "@autumn/balance-worker-client";
import { createReplayHydrationCoordinator } from "@/internal/balances/replay/createReplayHydrationCoordinator.js";
import type { ReplayHydrationWorkerClient } from "@/internal/balances/replay/replayHydrationContracts.js";
import {
	createLoadedSource,
	createNotInitializedError,
	createReplayHydrationFixture,
} from "./replay-hydration-fixture.js";

function prewarmMissingClient({
	initialize,
}: {
	initialize: ReplayHydrationWorkerClient["initialize"];
}): ReplayHydrationWorkerClient {
	return {
		check: async () => {
			throw createNotInitializedError();
		},
		track: async () => {
			throw createNotInitializedError();
		},
		initialize,
	};
}

test.concurrent(
	"an ambiguous initialize response retries once with the exact frozen seed",
	async () => {
		const fixture = createReplayHydrationFixture();
		const commands: InitializeRequest[] = [];
		const coordinator = createReplayHydrationCoordinator({
			source: createLoadedSource({
				state: fixture.state,
				catalogRows: fixture.catalogRows,
			}),
			client: prewarmMissingClient({
				initialize: async ({ request }) => {
					commands.push(request);
					if (commands.length === 1)
						throw new BalanceWorkerClientError({
							code: "TRANSPORT",
							outcome: "unknown",
							message: "Reply was lost",
						});
					return {
						result: { status: "initialized", duplicate: true },
						state: request.state,
					};
				},
			}),
		});
		try {
			expect(
				await coordinator.prewarm({ selection: fixture.selection }),
			).toEqual({ kind: "duplicate", freshParity: false });
			expect(commands).toHaveLength(2);
			expect(commands[1]).toBe(commands[0]);
			expect(commands[1]).toEqual(commands[0]);
		} finally {
			await coordinator.close();
		}
	},
);

test.concurrent(
	"baseline time participates in stable seed identity while state content does not",
	async () => {
		const first = createReplayHydrationFixture();
		const changedState = structuredClone(first.state);
		const changedRow = changedState.customerEntitlements.find(
			(row) => row.id === "messages_grant",
		);
		if (!changedRow) throw new Error("Expected the messages grant");
		changedRow.balance = 71;
		const commands: InitializeRequest[] = [];
		for (const { selection, state } of [
			{ selection: first.selection, state: first.state },
			{ selection: first.selection, state: changedState },
			{
				selection: {
					...first.selection,
					baseline: {
						...first.selection.baseline,
						capturedAtMs: first.selection.baseline.capturedAtMs + 1,
					},
				},
				state: first.state,
			},
		]) {
			const coordinator = createReplayHydrationCoordinator({
				source: createLoadedSource({ state, catalogRows: first.catalogRows }),
				client: prewarmMissingClient({
					initialize: async ({ request }) => {
						commands.push(request);
						return {
							result: { status: "initialized", duplicate: false },
							state: request.state,
						};
					},
				}),
			});
			await coordinator.prewarm({ selection });
			await coordinator.close();
		}
		expect(commands[0].command.commandId).toBe(commands[1].command.commandId);
		expect(commands[0].command.commandId).not.toBe(
			commands[2].command.commandId,
		);
		expect(commands[0].command.requestId).toBe(commands[1].command.requestId);
		expect(commands[0].state).not.toEqual(commands[1].state);
	},
);

test.concurrent(
	"named source refusal and mismatched loaded state never call initialize",
	async () => {
		const fixture = createReplayHydrationFixture();
		const mismatched = structuredClone(fixture.state);
		mismatched.identity.customerId = "wrong-customer";
		for (const { source, expected } of [
			{
				source: {
					load: async () => ({
						kind: "refused" as const,
						category: "unsupported" as const,
						reason: "reset_boundary_crossed",
					}),
				},
				expected: {
					name: "ReplayHydrationSourceRefusedError",
					code: "source_refused",
					category: "unsupported",
					reason: "reset_boundary_crossed",
				},
			},
			{
				source: createLoadedSource({
					state: mismatched,
					catalogRows: fixture.catalogRows,
				}),
				expected: {
					name: "ReplayHydrationSourceMismatchError",
					code: "source_mismatch",
				},
			},
		]) {
			let initializeCalls = 0;
			const coordinator = createReplayHydrationCoordinator({
				source,
				client: prewarmMissingClient({
					initialize: async () => {
						initializeCalls++;
						return {
							result: { status: "initialized", duplicate: false },
							state: fixture.state,
						};
					},
				}),
			});
			await expect(
				coordinator.prewarm({ selection: fixture.selection }),
			).rejects.toMatchObject(expected);
			expect(initializeCalls).toBe(0);
			await coordinator.close();
		}
	},
);

test.concurrent(
	"prewarm preserves initialization decisions without claiming existing state is fresh parity",
	async () => {
		const fixture = createReplayHydrationFixture();
		for (const kind of [
			"initialized",
			"duplicate",
			"already_initialized",
		] as const) {
			const coordinator = createReplayHydrationCoordinator({
				source: createLoadedSource({
					state: fixture.state,
					catalogRows: fixture.catalogRows,
				}),
				client: prewarmMissingClient({
					initialize: async () => ({
						result:
							kind === "already_initialized"
								? { status: "already_initialized", duplicate: false }
								: { status: "initialized", duplicate: kind === "duplicate" },
						state: fixture.state,
					}),
				}),
			});
			expect(
				await coordinator.prewarm({ selection: fixture.selection }),
			).toEqual({
				kind,
				freshParity: kind === "initialized",
			});
			await coordinator.close();
		}
	},
);
