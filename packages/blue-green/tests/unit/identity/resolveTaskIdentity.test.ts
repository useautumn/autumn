import { describe, expect, test } from "bun:test";
import { resolveTaskIdentity } from "../../../src/blueGreen.js";

const metadataUri = "http://169.254.170.2/v4/abc";
const cluster = "arn:aws:ecs:us-east-2:123456789012:cluster/autumn";
const taskMetadata = { Cluster: cluster, ServiceName: "herald-green" };
const serviceArn =
	"arn:aws:ecs:us-east-2:123456789012:service/autumn/herald-green";

const createHarness = ({ responses }: { responses: (Response | Error)[] }) => {
	const calls: string[] = [];
	const waits: number[] = [];
	const warnings: string[] = [];
	const fetch = async (url: string) => {
		calls.push(url);
		const next = responses.shift();
		if (!next) throw new Error("No response scripted");
		if (next instanceof Error) throw next;
		return next;
	};
	const sleep = async (ms: number) => {
		waits.push(ms);
	};
	const logger = {
		warn: (message: unknown) => {
			warnings.push(String(message));
		},
	};
	return { calls, waits, warnings, fetch, sleep, logger };
};

describe("ECS task identity", () => {
	test("off ECS it resolves at once with no service and no fetch", async () => {
		const harness = createHarness({ responses: [] });
		const identity = await resolveTaskIdentity({
			ctx: harness,
			env: { FC_GIT_COMMIT_SHA: "abc123" },
		});
		expect(identity).toEqual({ serviceArn: null, imageSha: "abc123" });
		expect(harness.calls).toEqual([]);
	});

	test("retries a failing metadata fetch with backoff and resolves the service ARN once it answers", async () => {
		const harness = createHarness({
			responses: [
				new Error("timeout"),
				new Response("busy", { status: 503 }),
				Response.json(taskMetadata),
			],
		});
		const identity = await resolveTaskIdentity({
			ctx: harness,
			env: { ECS_CONTAINER_METADATA_URI_V4: metadataUri, IMAGE_TAG: "sha-1" },
		});
		expect(identity).toEqual({ serviceArn, imageSha: "sha-1" });
		expect(harness.calls).toEqual(Array(3).fill(`${metadataUri}/task`));
		expect(harness.waits).toEqual([500, 1_000]);
		expect(harness.warnings).toHaveLength(2);
	});

	test("after every attempt fails it refuses to start", async () => {
		const harness = createHarness({
			responses: Array.from({ length: 5 }, () => new Error("ECONNREFUSED")),
		});
		await expect(
			resolveTaskIdentity({
				ctx: harness,
				env: { ECS_CONTAINER_METADATA_URI_V4: metadataUri },
			}),
		).rejects.toThrow("ECS task metadata unavailable after 5 attempts");
		expect(harness.calls).toHaveLength(5);
		expect(harness.waits).toEqual([500, 1_000, 2_000, 4_000]);
	});

	test("metadata without a parseable cluster ARN is not retried, and refuses to start", async () => {
		const harness = createHarness({
			responses: [Response.json({ Cluster: "autumn", ServiceName: "x" })],
		});
		await expect(
			resolveTaskIdentity({
				ctx: harness,
				env: { ECS_CONTAINER_METADATA_URI_V4: metadataUri },
			}),
		).rejects.toThrow("names no service");
		expect(harness.calls).toHaveLength(1);
	});
});
