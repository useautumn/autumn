import { expect, test } from "bun:test";
import type { TrackCommand, TrackDecision } from "@autumn/balance-engine";
import { createBalanceShadow } from "@/internal/balances/shadow/createBalanceShadow.js";

const command: TrackCommand = {
	schemaVersion: 1,
	type: "track",
	commandId: "track-1",
	requestId: "request-1",
	identity: { orgId: "org_test", env: "sandbox", customerId: "cus_test" },
	entityId: null,
	featureId: "messages",
	value: 5,
	overageBehavior: "cap",
	properties: null,
	occurredAt: 1_800_000_000_000,
};
const source = { kind: "returned", remaining: 5, usage: 5 } as const;
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

test.concurrent(
	"copying is deferred and a slow worker cannot hold the caller",
	async () => {
		const calls: TrackCommand[] = [];
		const events: Record<string, unknown>[] = [];
		const gate = Promise.withResolvers<TrackDecision>();
		const shadow = createBalanceShadow({
			dependencies: {
				client: {
					track: async ({ command }) => {
						calls.push(command);
						return gate.promise;
					},
				},
				report: (event) => events.push(event),
			},
		});
		expect(shadow.submit({ command, source })).toBe(true);
		expect(calls).toHaveLength(0);
		await tick();
		expect(calls).toEqual([command]);
		expect(shadow.status()).toMatchObject({ submitted: 1, inFlight: 1 });
		gate.resolve({ kind: "unsupported", reason: "feature_not_found" });
		await tick();
		expect(events).toContainEqual(
			expect.objectContaining({
				event: "completed",
				source,
				shadow: { kind: "unsupported", reason: "feature_not_found" },
			}),
		);
		await shadow.stop();
	},
);

test.concurrent(
	"queue capacity and shutdown drops are visible, and reporting failures are isolated",
	async () => {
		const events: Record<string, unknown>[] = [];
		const shadow = createBalanceShadow({
			dependencies: {
				client: {
					track: async ({ signal }) =>
						new Promise((_, reject) => {
							signal!.addEventListener("abort", () => reject(signal!.reason), {
								once: true,
							});
						}),
				},
				report: (event) => {
					events.push(event);
					if (event.event === "dropped") throw new Error("logger failed");
				},
			},
			limits: { maxPending: 2, concurrency: 1, timeoutMs: 1_000 },
		});
		expect(shadow.submit({ command, source })).toBe(true);
		expect(
			shadow.submit({ command: { ...command, commandId: "track-2" }, source }),
		).toBe(true);
		expect(
			shadow.submit({ command: { ...command, commandId: "track-3" }, source }),
		).toBe(false);
		await tick();
		await Promise.all([shadow.stop(), shadow.stop()]);
		expect(shadow.status()).toMatchObject({
			pending: 0,
			inFlight: 0,
			dropped: 2,
			failed: 1,
		});
		expect(events).toContainEqual(
			expect.objectContaining({ event: "dropped", reason: "queue_full" }),
		);
		expect(events).toContainEqual(
			expect.objectContaining({ event: "dropped", reason: "shutdown" }),
		);
		expect(shadow.submit({ command, source })).toBe(false);
	},
);

test.concurrent(
	"a delivery timeout releases capacity and is not reported as a balance mismatch",
	async () => {
		const events: Record<string, unknown>[] = [];
		const failed = Promise.withResolvers<void>();
		const shadow = createBalanceShadow({
			dependencies: {
				client: {
					track: async ({ signal }) =>
						new Promise((_, reject) => {
							signal!.addEventListener("abort", () => reject(signal!.reason), {
								once: true,
							});
						}),
				},
				report: (event) => {
					events.push(event);
					if (event.event === "failed") failed.resolve();
				},
			},
			limits: { maxPending: 1, concurrency: 1, timeoutMs: 5 },
		});
		expect(shadow.submit({ command, source })).toBe(true);
		await failed.promise;
		await tick();
		expect(shadow.status()).toMatchObject({ failed: 1, inFlight: 0 });
		expect(events).toContainEqual(
			expect.objectContaining({
				event: "failed",
				commandId: command.commandId,
			}),
		);
		await shadow.stop();
	},
);
