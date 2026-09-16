/**
 * The replay coordinator loads only an exact worker miss, freezes the original
 * request, and shares one exact seed per full customer identity and selection.
 */
import { expect, test } from "bun:test";
import type {
	CheckDecision,
	InitializeCommand,
	TrackCommand,
	TrackDecision,
} from "@autumn/balance-engine";
import {
	type BalanceWorkerClient,
	BalanceWorkerClientError,
} from "@autumn/balance-worker-client";
import { createBalanceHydrationCoordinator } from "@/internal/balances/hydration/createBalanceHydrationCoordinator.js";
import {
	createBalanceHydrationFixture,
	createLoadedSource,
	createNotInitializedError,
	tick,
} from "./balance-hydration-fixture.js";

const unsupportedTrack: TrackDecision = {
	kind: "unsupported",
	reason: "feature_not_found",
};
const unsupportedCheck: CheckDecision = {
	kind: "unsupported",
	reason: "feature_not_found",
};

test.concurrent(
	"hot check and prewarm never read the source or initialize",
	async () => {
		const fixture = createBalanceHydrationFixture();
		let sourceCalls = 0;
		let initializeCalls = 0;
		const coordinator = createBalanceHydrationCoordinator({
			source: createLoadedSource({
				state: fixture.state,
				onLoad: async () => {
					sourceCalls++;
					return { kind: "loaded", state: fixture.state };
				},
			}),
			client: {
				check: async () => unsupportedCheck,
				track: async () => unsupportedTrack,
				initialize: async ({ command }) => {
					initializeCalls++;
					return { kind: "initialized", state: command.state };
				},
			},
		});
		try {
			expect(
				await coordinator.check({
					selection: fixture.selection,
					command: fixture.checkCommand,
				}),
			).toBe(unsupportedCheck);
			expect(
				await coordinator.prewarm({ selection: fixture.selection }),
			).toEqual({ kind: "already_ready", freshParity: false });
			expect(sourceCalls).toBe(0);
			expect(initializeCalls).toBe(0);
		} finally {
			await coordinator.close();
		}
	},
);

test.concurrent(
	"only the exact typed not-initialized miss loads; all other failures propagate",
	async () => {
		const fixture = createBalanceHydrationFixture();
		const failures: unknown[] = [
			new Error("unknown"),
			new BalanceWorkerClientError({
				code: "NO_OWNER",
				outcome: "not_submitted",
				message: "No owner",
			}),
			new BalanceWorkerClientError({
				code: "WORKER_ERROR",
				workerCode: "NOT_READY",
				outcome: "not_submitted",
				message: "Owner is recovering",
			}),
			new BalanceWorkerClientError({
				code: "DEADLINE",
				outcome: "unknown",
				message: "Timed out",
			}),
		];
		for (const failure of failures) {
			let sourceCalls = 0;
			const coordinator = createBalanceHydrationCoordinator({
				source: createLoadedSource({
					state: fixture.state,
					onLoad: async () => {
						sourceCalls++;
						return { kind: "loaded", state: fixture.state };
					},
				}),
				client: {
					check: async () => {
						throw failure;
					},
					track: async () => {
						throw failure;
					},
					initialize: async ({ command }) => ({
						kind: "initialized",
						state: command.state,
					}),
				},
			});
			try {
				await expect(
					coordinator.track({
						selection: fixture.selection,
						command: fixture.trackCommand,
					}),
				).rejects.toBe(failure);
				expect(sourceCalls).toBe(0);
			} finally {
				await coordinator.close();
			}
		}
	},
);

test.concurrent(
	"cold track retries the original immutable command once after durable initialization",
	async () => {
		const fixture = createBalanceHydrationFixture();
		const sourceGate = Promise.withResolvers<void>();
		const trackCommands: TrackCommand[] = [];
		const initializeCommands: InitializeCommand[] = [];
		const client: BalanceWorkerClient = {
			track: async ({ command }) => {
				trackCommands.push(structuredClone(command));
				if (trackCommands.length === 1) throw createNotInitializedError();
				return unsupportedTrack;
			},
			check: async () => unsupportedCheck,
			initialize: async ({ command }) => {
				initializeCommands.push(command);
				return { kind: "initialized", state: command.state };
			},
		};
		const coordinator = createBalanceHydrationCoordinator({
			source: createLoadedSource({
				state: fixture.state,
				onLoad: async () => {
					await sourceGate.promise;
					return { kind: "loaded", state: fixture.state };
				},
			}),
			client,
		});
		try {
			const original = structuredClone(fixture.trackCommand);
			const result = coordinator.track({
				selection: fixture.selection,
				command: fixture.trackCommand,
			});
			await tick();
			fixture.trackCommand.value = 999;
			fixture.trackCommand.commandId = "mutated";
			fixture.trackCommand.occurredAt = 0;
			sourceGate.resolve();
			expect(await result).toBe(unsupportedTrack);
			expect(trackCommands).toEqual([original, original]);
			expect(initializeCommands).toHaveLength(1);
			expect(initializeCommands[0]).toMatchObject({
				identity: fixture.selection.identity,
				occurredAt: fixture.selection.baseline.capturedAtMs,
				state: fixture.state,
			});
		} finally {
			await coordinator.close();
		}
	},
);

test.concurrent(
	"same identity and canonical selection singleflight while conflicting selections fail by name",
	async () => {
		const fixture = createBalanceHydrationFixture();
		const sourceGate = Promise.withResolvers<void>();
		let sourceCalls = 0;
		const coordinator = createBalanceHydrationCoordinator({
			source: createLoadedSource({
				state: fixture.state,
				onLoad: async () => {
					sourceCalls++;
					await sourceGate.promise;
					return { kind: "loaded", state: fixture.state };
				},
			}),
			client: {
				check: async () => {
					throw createNotInitializedError();
				},
				track: async () => {
					throw createNotInitializedError();
				},
				initialize: async ({ command }) => ({
					kind: "initialized",
					state: command.state,
				}),
			},
		});
		const first = coordinator.prewarm({
			selection: {
				...fixture.selection,
				featureIds: ["messages", "messages"],
			},
		});
		const duplicate = coordinator.prewarm({
			selection: { ...fixture.selection, featureIds: ["messages"] },
		});
		await tick();
		await expect(
			coordinator.prewarm({
				selection: {
					...fixture.selection,
					baseline: {
						...fixture.selection.baseline,
						capturedAtMs: fixture.selection.baseline.capturedAtMs + 1,
					},
				},
			}),
		).rejects.toMatchObject({
			name: "BalanceHydrationSelectionConflictError",
			code: "selection_conflict",
		});
		sourceGate.resolve();
		await Promise.all([first, duplicate]);
		expect(sourceCalls).toBe(1);
		await coordinator.close();
	},
);
