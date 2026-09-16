/**
 * A source result becomes one stable initialization command. Ambiguous delivery
 * may resend that command once, while refusals and drift never partially seed.
 */
import { expect, test } from "bun:test";
import type { InitializeCommand } from "@autumn/balance-engine";
import { BalanceWorkerClientError } from "@autumn/balance-worker-client";
import type { BalanceHydrationWorkerClient } from "@/internal/balances/hydration/balanceHydrationContracts.js";
import { createBalanceHydrationCoordinator } from "@/internal/balances/hydration/createBalanceHydrationCoordinator.js";
import {
	createBalanceHydrationFixture,
	createLoadedSource,
	createNotInitializedError,
} from "./balance-hydration-fixture.js";

function prewarmMissingClient({
	initialize,
}: {
	initialize: BalanceHydrationWorkerClient["initialize"];
}): BalanceHydrationWorkerClient {
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
		const fixture = createBalanceHydrationFixture();
		const commands: InitializeCommand[] = [];
		const coordinator = createBalanceHydrationCoordinator({
			source: createLoadedSource({ state: fixture.state }),
			client: prewarmMissingClient({
				initialize: async ({ command }) => {
					commands.push(command);
					if (commands.length === 1)
						throw new BalanceWorkerClientError({
							code: "TRANSPORT",
							outcome: "unknown",
							message: "Reply was lost",
						});
					return { kind: "duplicate", state: command.state };
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
		const first = createBalanceHydrationFixture();
		const changedState = structuredClone(first.state);
		changedState.featureStatesById.messages.customerEntitlements[0].balance = 71;
		const commands: InitializeCommand[] = [];
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
			const coordinator = createBalanceHydrationCoordinator({
				source: createLoadedSource({ state }),
				client: prewarmMissingClient({
					initialize: async ({ command }) => {
						commands.push(command);
						return { kind: "initialized", state: command.state };
					},
				}),
			});
			await coordinator.prewarm({ selection });
			await coordinator.close();
		}
		expect(commands[0].initializationId).toBe(commands[1].initializationId);
		expect(commands[0].initializationId).not.toBe(commands[2].initializationId);
		expect(commands[0].requestId).toBe(commands[1].requestId);
		expect(commands[0].state).not.toEqual(commands[1].state);
	},
);

test.concurrent(
	"named source refusal and mismatched loaded state never call initialize",
	async () => {
		const fixture = createBalanceHydrationFixture();
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
					name: "BalanceHydrationSourceRefusedError",
					code: "source_refused",
					category: "unsupported",
					reason: "reset_boundary_crossed",
				},
			},
			{
				source: createLoadedSource({ state: mismatched }),
				expected: {
					name: "BalanceHydrationSourceMismatchError",
					code: "source_mismatch",
				},
			},
		]) {
			let initializeCalls = 0;
			const coordinator = createBalanceHydrationCoordinator({
				source,
				client: prewarmMissingClient({
					initialize: async ({ command }) => {
						initializeCalls++;
						return { kind: "initialized", state: command.state };
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
		const fixture = createBalanceHydrationFixture();
		for (const kind of [
			"initialized",
			"duplicate",
			"already_initialized",
		] as const) {
			const coordinator = createBalanceHydrationCoordinator({
				source: createLoadedSource({ state: fixture.state }),
				client: prewarmMissingClient({
					initialize: async ({ command }) =>
						kind === "already_initialized"
							? { kind }
							: { kind, state: command.state },
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
