import { afterEach, describe, expect, jest, test } from "bun:test";
import { createEdgeConfigRegistry } from "@/internal/misc/edgeConfigs/edgeConfigRegistry.js";

const registries: ReturnType<typeof createEdgeConfigRegistry>[] = [];

const createRegistry = ({
	timestamps,
	writeTimestamp = jest.fn(async () => "created"),
}: {
	timestamps: (string | null | Error)[];
	writeTimestamp?: ReturnType<typeof jest.fn<() => Promise<string>>>;
}) => {
	let readIndex = 0;
	const readTimestamp = jest.fn(async () => {
		const value = timestamps[Math.min(readIndex++, timestamps.length - 1)];
		if (value instanceof Error) throw value;
		return value ?? null;
	});
	const registry = createEdgeConfigRegistry({
		readTimestamp,
		writeTimestamp,
		pollIntervalMs: 60_000,
	});
	const refresh = jest.fn(async () => {});
	registry.register({ store: { refresh } });
	registries.push(registry);

	return { readTimestamp, refresh, registry, writeTimestamp };
};

afterEach(() => {
	for (const registry of registries) registry.stop();
	registries.length = 0;
});

describe("edge config registry", () => {
	test("loads every config on startup and creates a missing timestamp", async () => {
		const { refresh, registry, writeTimestamp } = createRegistry({
			timestamps: [null],
		});

		await registry.start();

		expect(refresh).toHaveBeenCalledTimes(1);
		expect(writeTimestamp).toHaveBeenCalledTimes(1);
	});

	test("only reads the timestamp while it is unchanged", async () => {
		const { readTimestamp, refresh, registry } = createRegistry({
			timestamps: ["v1", "v1"],
		});
		await registry.start();

		await registry.checkForChanges();

		expect(readTimestamp).toHaveBeenCalledTimes(2);
		expect(refresh).toHaveBeenCalledTimes(1);
	});

	test("refreshes every config when the timestamp changes", async () => {
		const { refresh, registry } = createRegistry({
			timestamps: ["v1", "v2"],
		});
		const secondRefresh = jest.fn(async () => {});
		registry.register({ store: { refresh: secondRefresh } });
		await registry.start();

		await registry.checkForChanges();

		expect(refresh).toHaveBeenCalledTimes(2);
		expect(secondRefresh).toHaveBeenCalledTimes(2);
	});

	test("falls back to refreshing configs when timestamp polling fails", async () => {
		const { refresh, registry } = createRegistry({
			timestamps: ["v1", new Error("S3 unavailable")],
		});
		await registry.start();

		await registry.checkForChanges();

		expect(refresh).toHaveBeenCalledTimes(2);
	});

	test("recreates a deleted timestamp after refreshing configs", async () => {
		const writeTimestamp = jest.fn(async () => "v2");
		const { refresh, registry } = createRegistry({
			timestamps: ["v1", null],
			writeTimestamp,
		});
		await registry.start();

		await registry.checkForChanges();

		expect(refresh).toHaveBeenCalledTimes(2);
		expect(writeTimestamp).toHaveBeenCalledTimes(1);
	});

	// Every process runs this loop, so an unbounded create-on-null retries the
	// write on each poll across the whole fleet while the key stays missing.
	test("creates the timestamp once while it stays missing", async () => {
		const writeTimestamp = jest.fn(async () => "created");
		const { refresh, registry } = createRegistry({
			timestamps: [null],
			writeTimestamp,
		});
		await registry.start();

		await registry.checkForChanges();
		await registry.checkForChanges();

		expect(writeTimestamp).toHaveBeenCalledTimes(1);
		expect(refresh).toHaveBeenCalledTimes(3);
	});

	test("stops retrying a failing timestamp write but keeps refreshing", async () => {
		const writeTimestamp = jest.fn(async () => {
			throw new Error("AccessDenied");
		});
		const { refresh, registry } = createRegistry({
			timestamps: [null],
			writeTimestamp,
		});
		await registry.start();

		await registry.checkForChanges();
		await registry.checkForChanges();

		expect(writeTimestamp).toHaveBeenCalledTimes(1);
		expect(refresh).toHaveBeenCalledTimes(3);
	});

	// The timestamp is the only propagation signal, so a write that never lands
	// would otherwise leave every process serving stale config indefinitely.
	test("refreshes on the backstop interval even when the timestamp is unchanged", async () => {
		const refresh = jest.fn(async () => {});
		const registry = createEdgeConfigRegistry({
			readTimestamp: async () => "v1",
			writeTimestamp: async () => "v1",
			pollIntervalMs: 60_000,
			backstopIntervalMs: 20,
		});
		registry.register({ store: { refresh } });
		registries.push(registry);
		await registry.start();

		await new Promise((resolve) => setTimeout(resolve, 70));

		expect(refresh.mock.calls.length).toBeGreaterThan(1);
	});

	test("recreates the timestamp again after it reappears and is deleted", async () => {
		const writeTimestamp = jest.fn(async () => "recreated");
		const { registry } = createRegistry({
			timestamps: [null, "v1", null],
			writeTimestamp,
		});
		await registry.start();

		await registry.checkForChanges();
		await registry.checkForChanges();

		expect(writeTimestamp).toHaveBeenCalledTimes(2);
	});
});
