import { expect, test } from "bun:test";
import { startBalanceShadowSession } from "@/internal/balances/shadow/startBalanceShadowSession.js";

function createFixture() {
	const events: Record<string, unknown>[] = [];
	const started = Promise.withResolvers<void>();
	const ready = Promise.withResolvers<void>();
	const failed = Promise.withResolvers<void>();
	let stops = 0;
	const session = startBalanceShadowSession({
		config: {
			runId: "test",
			ownershipTopic: "shadow",
			expiresAt: Date.now() + 60_000,
			customers: [],
		},
		dependencies: {
			owners: {
				start: () => started.promise,
				stop: async () => {
					stops++;
				},
			},
			client: {
				track: async () => {
					throw new Error("not used");
				},
			},
			report: (event) => {
				events.push(event);
				if (event.event === "ready") ready.resolve();
				if (event.event === "startup_failed") failed.resolve();
			},
		},
	});
	return { session, events, started, ready, failed, stops: () => stops };
}

test.concurrent(
	"ownership startup is detached and stop settles once",
	async () => {
		const fixture = createFixture();
		try {
			expect(fixture.events).toContainEqual(
				expect.objectContaining({ event: "starting" }),
			);
			expect(fixture.events.some((event) => event.event === "ready")).toBe(
				false,
			);
			fixture.started.resolve();
			await fixture.ready.promise;
			await Promise.all([fixture.session.stop(), fixture.session.stop()]);
			expect(fixture.stops()).toBe(1);
			expect(fixture.events).toContainEqual(
				expect.objectContaining({ event: "stopped" }),
			);
		} finally {
			await fixture.session.stop();
		}
	},
);

test.concurrent(
	"ownership failure is reported and contained, not a server startup rejection",
	async () => {
		const fixture = createFixture();
		try {
			expect(fixture.events.some((event) => event.event === "starting")).toBe(
				true,
			);
			fixture.started.reject(new Error("Kafka unavailable"));
			await fixture.failed.promise;
			await fixture.session.stop();
			expect(fixture.stops()).toBe(1);
			expect(fixture.events).toContainEqual(
				expect.objectContaining({
					event: "startup_failed",
					reason: "Kafka unavailable",
				}),
			);
		} finally {
			await fixture.session.stop();
		}
	},
);

test.concurrent(
	"shutdown during ownership startup cannot announce ready later",
	async () => {
		const fixture = createFixture();
		await fixture.session.stop();
		fixture.started.resolve();
		await new Promise<void>((resolve) => setImmediate(resolve));
		expect(fixture.stops()).toBe(1);
		expect(fixture.events.some((event) => event.event === "ready")).toBe(false);
	},
);

test.concurrent(
	"expiry stops a session even without any more requests",
	async () => {
		const expired = Promise.withResolvers<void>();
		let stops = 0;
		const session = startBalanceShadowSession({
			config: {
				runId: "expires",
				ownershipTopic: "shadow",
				expiresAt: Date.now(),
				customers: [],
			},
			dependencies: {
				owners: {
					start: async () => undefined,
					stop: async () => {
						stops++;
					},
				},
				client: {
					track: async () => {
						throw new Error("not used");
					},
				},
				report: (event) => {
					if (event.event === "window_expired") expired.resolve();
				},
			},
		});
		try {
			await expired.promise;
			await session.stop();
			expect(stops).toBe(1);
		} finally {
			await session.stop();
		}
	},
);

test.concurrent(
	"a stuck ownership stop cannot hold server shutdown indefinitely",
	async () => {
		const events: Record<string, unknown>[] = [];
		const session = startBalanceShadowSession({
			config: {
				runId: "stuck",
				ownershipTopic: "shadow",
				expiresAt: Date.now() + 60_000,
				customers: [],
			},
			dependencies: {
				owners: {
					start: async () => undefined,
					stop: () => new Promise(() => undefined),
				},
				client: {
					track: async () => {
						throw new Error("not used");
					},
				},
				report: (event) => events.push(event),
			},
		});
		await session.stop();
		expect(events).toContainEqual(
			expect.objectContaining({ event: "shutdown_timeout" }),
		);
		await session.stop();
	},
	10_000,
);
