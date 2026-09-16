/**
 * Hydration work has a bounded shared lifetime: queue time counts, cancellation
 * is per waiter, and physical work retains capacity until it really settles.
 */
import { expect, test } from "bun:test";
import type { CustomerMeteringState } from "@autumn/balance-engine";
import { createReplayHydrationCoordinator } from "@/internal/balances/replay/createReplayHydrationCoordinator.js";
import type { ReplayHydrationSource } from "@/internal/balances/replay/replayHydrationContracts.js";
import {
	createLoadedSource,
	createNotInitializedError,
	createReplayHydrationFixture,
	tick,
} from "./replay-hydration-fixture.js";

function missingClient() {
	return {
		check: async () => {
			throw createNotInitializedError();
		},
		track: async () => {
			throw createNotInitializedError();
		},
		initialize: async ({
			command,
		}: {
			command: { state: CustomerMeteringState };
		}) => ({ kind: "initialized" as const, state: command.state }),
	};
}

test.concurrent("config requires positive bounded safe integers", async () => {
	const fixture = createReplayHydrationFixture();
	for (const config of [
		{ maxActive: 0 },
		{ maxQueued: -1 },
		{ deadlineMs: 0 },
		{ maxActive: Number.POSITIVE_INFINITY },
	]) {
		expect(() =>
			createReplayHydrationCoordinator({
				source: createLoadedSource({ state: fixture.state }),
				client: missingClient(),
				config,
			}),
		).toThrow();
	}
});

test.concurrent(
	"four active loads and 64 queued unique identities reject the next unique job while duplicates attach",
	async () => {
		const base = createReplayHydrationFixture();
		const sourceGates = new Map<
			string,
			ReturnType<typeof Promise.withResolvers<void>>
		>();
		let active = 0;
		let peakActive = 0;
		const source: ReplayHydrationSource = {
			load: async ({ selection }) => {
				active++;
				peakActive = Math.max(peakActive, active);
				const gate = Promise.withResolvers<void>();
				sourceGates.set(selection.identity.customerId, gate);
				await gate.promise;
				active--;
				return {
					kind: "loaded",
					state: {
						...base.state,
						identity: selection.identity,
					},
				};
			},
		};
		const coordinator = createReplayHydrationCoordinator({
			source,
			client: missingClient(),
			config: { deadlineMs: 10_000 },
		});
		const selections = Array.from({ length: 69 }, (_, index) => ({
			...base.selection,
			identity: {
				...base.selection.identity,
				customerId: `customer-${index}`,
			},
		}));
		const accepted = selections
			.slice(0, 68)
			.map((selection) => coordinator.prewarm({ selection }));
		const duplicate = coordinator.prewarm({ selection: selections[67] });
		await tick();
		expect(peakActive).toBe(4);
		await expect(
			coordinator.prewarm({ selection: selections[68] }),
		).rejects.toMatchObject({
			name: "ReplayHydrationQueueSaturatedError",
			code: "queue_saturated",
		});
		for (const gate of sourceGates.values()) gate.resolve();
		while (sourceGates.size < 68) {
			await tick();
			for (const gate of sourceGates.values()) gate.resolve();
		}
		await Promise.all([...accepted, duplicate]);
		await coordinator.close();
	},
);

test.concurrent(
	"deadline rejects promptly but a source that ignores abort retains its slot and cannot initialize late",
	async () => {
		const first = createReplayHydrationFixture();
		const second = createReplayHydrationFixture({
			identity: { ...first.selection.identity, customerId: "cus_second" },
		});
		const firstGate = Promise.withResolvers<void>();
		const secondStarted = Promise.withResolvers<void>();
		const initialized: string[] = [];
		let sourceCalls = 0;
		const coordinator = createReplayHydrationCoordinator({
			source: {
				load: async ({ selection }) => {
					sourceCalls++;
					if (selection.identity.customerId === "cus_test")
						await firstGate.promise;
					else secondStarted.resolve();
					return {
						kind: "loaded",
						state: {
							...first.state,
							identity: selection.identity,
						},
					};
				},
			},
			client: {
				...missingClient(),
				initialize: async ({ command }) => {
					initialized.push(command.identity.customerId);
					return { kind: "initialized", state: command.state };
				},
			},
			config: { maxActive: 1, maxQueued: 1, deadlineMs: 30 },
		});
		await expect(
			coordinator.prewarm({ selection: first.selection }),
		).rejects.toMatchObject({
			name: "ReplayHydrationDeadlineError",
			code: "deadline",
		});
		const secondResult = coordinator.prewarm({ selection: second.selection });
		await tick();
		expect(sourceCalls).toBe(1);
		firstGate.resolve();
		await secondStarted.promise;
		expect(await secondResult).toMatchObject({ kind: "initialized" });
		expect(initialized).toEqual(["cus_second"]);
		await coordinator.close();
	},
);

test.concurrent(
	"one waiter cancellation leaves shared work alive; cancelling every waiter aborts it and close awaits physical settlement",
	async () => {
		const fixture = createReplayHydrationFixture();
		const physicalGate = Promise.withResolvers<void>();
		const sourceStarted = Promise.withResolvers<AbortSignal>();
		let initializeCalls = 0;
		const coordinator = createReplayHydrationCoordinator({
			source: {
				load: async ({ signal }) => {
					sourceStarted.resolve(signal);
					await physicalGate.promise;
					return { kind: "loaded", state: fixture.state };
				},
			},
			client: {
				...missingClient(),
				initialize: async ({ command }) => {
					initializeCalls++;
					return { kind: "initialized", state: command.state };
				},
			},
			config: { deadlineMs: 10_000 },
		});
		const firstController = new AbortController();
		const secondController = new AbortController();
		const first = coordinator.prewarm({
			selection: fixture.selection,
			signal: firstController.signal,
		});
		const second = coordinator.prewarm({
			selection: fixture.selection,
			signal: secondController.signal,
		});
		const sharedSignal = await sourceStarted.promise;
		firstController.abort(new Error("first left"));
		await expect(first).rejects.toMatchObject({
			name: "ReplayHydrationAbortedError",
			code: "aborted",
		});
		expect(sharedSignal.aborted).toBe(false);
		secondController.abort(new Error("last left"));
		await expect(second).rejects.toMatchObject({ code: "aborted" });
		expect(sharedSignal.aborted).toBe(true);
		let closed = false;
		const closing = coordinator.close().then(() => {
			closed = true;
		});
		await tick();
		expect(closed).toBe(false);
		physicalGate.resolve();
		await closing;
		expect(initializeCalls).toBe(0);
		await coordinator.close();
	},
);
