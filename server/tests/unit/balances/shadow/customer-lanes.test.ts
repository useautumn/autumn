import { expect, test } from "bun:test";
import type { TrackCommand, TrackDecision } from "@autumn/balance-engine";
import { createBalanceShadow } from "@/internal/balances/shadow/createBalanceShadow.js";

const command: TrackCommand = {
	schemaVersion: 1,
	type: "track",
	commandId: "first",
	requestId: "request",
	identity: { orgId: "org_test", env: "sandbox", customerId: "cus_test" },
	entityId: null,
	featureId: "messages",
	value: 5,
	overageBehavior: "cap",
	properties: null,
	occurredAt: 1_800_000_000_000,
};
const source = { kind: "returned" } as const;
const decision: TrackDecision = {
	kind: "unsupported",
	reason: "feature_not_found",
};
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

test.concurrent(
	"one customer's features share a FIFO lane without blocking other customers",
	async () => {
		const calls: string[] = [];
		const first = Promise.withResolvers<TrackDecision>();
		const second = Promise.withResolvers<TrackDecision>();
		const startedSecond = Promise.withResolvers<void>();
		const shadow = createBalanceShadow({
			dependencies: {
				client: {
					track: async ({ command }) => {
						calls.push(command.commandId);
						if (command.commandId === "first") return first.promise;
						if (command.commandId === "second") {
							startedSecond.resolve();
							return second.promise;
						}
						return decision;
					},
				},
				report: () => undefined,
			},
		});
		try {
			shadow.submit({ command, source });
			shadow.submit({
				command: { ...command, commandId: "second", featureId: "tokens" },
				source,
			});
			shadow.submit({ command: { ...command, commandId: "third" }, source });
			shadow.submit({
				command: {
					...command,
					commandId: "other",
					identity: { ...command.identity, customerId: "other" },
				},
				source,
			});
			await tick();
			expect(calls).toEqual(["first", "other"]);
			first.reject(new Error("worker unavailable"));
			await startedSecond.promise;
			expect(calls).toEqual(["first", "other", "second"]);
			second.resolve(decision);
			await tick();
			await tick();
			expect(calls).toEqual(["first", "other", "second", "third"]);
			expect(shadow.status()).toMatchObject({
				failed: 1,
				completed: 3,
				pending: 0,
				inFlight: 0,
			});
		} finally {
			first.resolve(decision);
			second.resolve(decision);
			await shadow.stop();
		}
	},
);

test.concurrent(
	"equal customer IDs in different organizations and environments have independent lanes",
	async () => {
		const identities: TrackCommand["identity"][] = [];
		const gate = Promise.withResolvers<TrackDecision>();
		const shadow = createBalanceShadow({
			dependencies: {
				client: {
					track: async ({ command }) => {
						identities.push(command.identity);
						return gate.promise;
					},
				},
				report: () => undefined,
			},
		});
		const expected: TrackCommand["identity"][] = [
			command.identity,
			{ ...command.identity, orgId: "other" },
			{ ...command.identity, env: "live" },
		];
		try {
			for (const identity of expected)
				shadow.submit({ command: { ...command, identity }, source });
			await tick();
			expect(identities).toEqual(expected);
		} finally {
			gate.resolve(decision);
			await shadow.stop();
		}
	},
);

test.concurrent(
	"a timed-out copy releases its customer lane for the next copy",
	async () => {
		const calls: string[] = [];
		const completed = Promise.withResolvers<void>();
		const shadow = createBalanceShadow({
			limits: { maxPending: 2, concurrency: 2, timeoutMs: 10 },
			dependencies: {
				client: {
					track: async ({ command, signal }) => {
						calls.push(command.commandId);
						if (command.commandId === "second") return decision;
						return new Promise((_, reject) =>
							signal!.addEventListener("abort", () => reject(signal!.reason), {
								once: true,
							}),
						);
					},
				},
				report: (event) => {
					if (event.event === "completed") completed.resolve();
				},
			},
		});
		try {
			shadow.submit({ command, source });
			shadow.submit({ command: { ...command, commandId: "second" }, source });
			await tick();
			expect(calls).toEqual(["first"]);
			await completed.promise;
			expect(calls).toEqual(["first", "second"]);
			expect(shadow.status()).toMatchObject({ failed: 1, completed: 1 });
		} finally {
			await shadow.stop();
		}
	},
);
