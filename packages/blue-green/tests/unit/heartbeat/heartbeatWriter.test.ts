import { describe, expect, test } from "bun:test";
import type { EdgeConfigS3Client } from "@autumn/edge-config";
import {
	createHeartbeatWriter,
	heartbeatKeyOf,
	instanceIdOf,
	runProbe,
} from "../../../src/blueGreen.js";

const createHarness = ({
	build,
	failWrite = false,
}: {
	build: () => Promise<unknown>;
	failWrite?: boolean;
}) => {
	const written: { key: string; body: unknown }[] = [];
	const warnings: string[] = [];
	const s3Client: EdgeConfigS3Client = {
		send: async (command) => {
			if (failWrite) throw new Error("S3 unreachable");
			const { Key, Body } = command.input as { Key: string; Body: string };
			written.push({ key: Key, body: JSON.parse(Body) });
			return {};
		},
	};
	let tick: (() => void) | undefined;
	let cancelled = false;
	const writer = createHeartbeatWriter({
		ctx: {
			s3Client,
			location: { bucket: "autumn-test-server", region: "us-east-2" },
			build,
			logger: {
				warn: (message: unknown) => {
					warnings.push(String(message));
				},
			},
			schedule: ({ run }) => {
				tick = run;
				return () => {
					cancelled = true;
				};
			},
		},
		config: {
			key: heartbeatKeyOf({
				serviceName: "herald",
				fleetId: "1a2b3c4d",
				instanceId: "77-abcd",
			}),
		},
	});
	return {
		writer,
		written,
		warnings,
		tick: () => tick?.(),
		cancelled: () => cancelled,
	};
};

describe("heartbeat key", () => {
	test("is one object per task under the service and fleet prefix", () => {
		expect(
			heartbeatKeyOf({
				serviceName: "herald",
				fleetId: "1a2b3c4d",
				instanceId: "1-a",
			}),
		).toBe("admin/blue-green-heartbeats/herald/1a2b3c4d/1-a.json");
		expect(instanceIdOf()).toMatch(new RegExp(`^${process.pid}-[0-9a-f]{8}$`));
	});
});

describe("heartbeat writer", () => {
	test("writes the built body at start and on every tick, then stops with the schedule", async () => {
		let n = 0;
		const { writer, written, tick, cancelled } = createHarness({
			build: async () => ({ n: ++n }),
		});
		await writer.start();
		tick();
		await Bun.sleep(5);
		expect(written.map(({ body }) => body)).toEqual([{ n: 1 }, { n: 2 }]);
		expect(written[0]?.key).toBe(
			"admin/blue-green-heartbeats/herald/1a2b3c4d/77-abcd.json",
		);
		writer.stop();
		expect(cancelled()).toBe(true);
	});

	test("a failed write warns and the next tick tries again", async () => {
		const harness = createHarness({ build: async () => ({}), failWrite: true });
		await harness.writer.start();
		expect(harness.written).toEqual([]);
		expect(harness.warnings).toEqual(["Blue-green heartbeat not written"]);
	});

	test("a probe that throws is a failed probe with its message, timed either way", async () => {
		expect(await runProbe(async () => {})).toMatchObject({ ok: true });
		expect(
			await runProbe(async () => {
				throw new Error("connection refused");
			}),
		).toMatchObject({ ok: false, error: "connection refused" });
	});
});
