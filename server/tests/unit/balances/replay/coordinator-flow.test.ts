/**
 * The replay coordinator loads only an exact worker miss, freezes the original
 * request, and shares one exact seed per full customer identity and selection.
 */
import { expect, test } from "bun:test";
import type { InitializeRequest, TrackCommand } from "@autumn/balance-engine";
import {
	type BalanceWorkerClient,
	BalanceWorkerClientError,
} from "@autumn/balance-worker-client";
import { createReplayHydrationCoordinator } from "@/internal/balances/replay/createReplayHydrationCoordinator.js";
import {
	createLoadedSource,
	createNotInitializedError,
	createReplayHydrationFixture,
	tick,
} from "./replay-hydration-fixture.js";

/** The worker refuses the command outright; the coordinator must not treat it as a miss. */
const unsupported = () =>
	new BalanceWorkerClientError({
		code: "WORKER_ERROR",
		outcome: "not_submitted",
		message: "unsupported",
		workerCode: "UNSUPPORTED_COMMAND",
		workerReason: "feature_not_found",
	});

test.concurrent(
	"hot check and prewarm never read the source or initialize",
	async () => {
		const fixture = createReplayHydrationFixture();
		let sourceCalls = 0;
		let initializeCalls = 0;
		const coordinator = createReplayHydrationCoordinator({
			source: createLoadedSource({
				state: fixture.state,
				catalogRows: fixture.catalogRows,
				onLoad: async () => {
					sourceCalls++;
					return {
						kind: "loaded",
						state: fixture.state,
						catalogRows: fixture.catalogRows,
					};
				},
			}),
			client: {
				check: async () => {
					throw unsupported();
				},
				track: async () => {
					throw unsupported();
				},
				initialize: async () => {
					initializeCalls++;
					return {
						result: { status: "initialized", duplicate: false },
						state: fixture.state,
					};
				},
			},
		});
		try {
			await expect(
				coordinator.check({
					selection: fixture.selection,
					command: fixture.checkCommand,
				}),
			).rejects.toMatchObject({ workerCode: "UNSUPPORTED_COMMAND" });
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
		const fixture = createReplayHydrationFixture();
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
			const coordinator = createReplayHydrationCoordinator({
				source: createLoadedSource({
					state: fixture.state,
					catalogRows: fixture.catalogRows,
					onLoad: async () => {
						sourceCalls++;
						return {
							kind: "loaded",
							state: fixture.state,
							catalogRows: fixture.catalogRows,
						};
					},
				}),
				client: {
					check: async () => {
						throw failure;
					},
					track: async () => {
						throw failure;
					},
					initialize: async () => ({
						result: { status: "initialized", duplicate: false },
						state: fixture.state,
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
		const fixture = createReplayHydrationFixture();
		const sourceGate = Promise.withResolvers<void>();
		const trackCommands: TrackCommand[] = [];
		const initializeCommands: InitializeRequest[] = [];
		const client: BalanceWorkerClient = {
			track: async ({ command }) => {
				trackCommands.push(structuredClone(command));
				if (trackCommands.length === 1) throw createNotInitializedError();
				throw unsupported();
			},
			check: async () => {
				throw unsupported();
			},
			initialize: async ({ request }) => {
				initializeCommands.push(request);
				return {
					result: { status: "initialized", duplicate: false },
					state: request.state,
				};
			},
			evict: async () => ({ evicted: false }),
			finalize: async () => {
				throw unsupported();
			},
			confirmExpiredLock: async () => {
				throw unsupported();
			},
		};
		const coordinator = createReplayHydrationCoordinator({
			source: createLoadedSource({
				state: fixture.state,
				catalogRows: fixture.catalogRows,
				onLoad: async () => {
					await sourceGate.promise;
					return {
						kind: "loaded",
						state: fixture.state,
						catalogRows: fixture.catalogRows,
					};
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
			await expect(result).rejects.toMatchObject({
				workerCode: "UNSUPPORTED_COMMAND",
			});
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
		const fixture = createReplayHydrationFixture();
		const sourceGate = Promise.withResolvers<void>();
		let sourceCalls = 0;
		const coordinator = createReplayHydrationCoordinator({
			source: createLoadedSource({
				state: fixture.state,
				catalogRows: fixture.catalogRows,
				onLoad: async () => {
					sourceCalls++;
					await sourceGate.promise;
					return {
						kind: "loaded",
						state: fixture.state,
						catalogRows: fixture.catalogRows,
					};
				},
			}),
			client: {
				check: async () => {
					throw createNotInitializedError();
				},
				track: async () => {
					throw createNotInitializedError();
				},
				initialize: async () => ({
					result: { status: "initialized", duplicate: false },
					state: fixture.state,
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
			name: "ReplayHydrationSelectionConflictError",
			code: "selection_conflict",
		});
		sourceGate.resolve();
		await Promise.all([first, duplicate]);
		expect(sourceCalls).toBe(1);
		await coordinator.close();
	},
);
