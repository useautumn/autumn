import { describe, expect, test } from "bun:test";
import { fleetIdOf } from "../../../src/blueGreen/fleetIdOf.js";
import { resolveTaskIdentity } from "../../../src/blueGreen/resolveTaskIdentity.js";

const metadataUri = "http://169.254.170.2/v4/abc";
const cluster = "arn:aws:ecs:us-east-2:123456789012:cluster/autumn";
const taskMetadata = { Cluster: cluster, ServiceName: "balance-workers-green" };
const serviceArn =
	"arn:aws:ecs:us-east-2:123456789012:service/autumn/balance-workers-green";

const createHarness = ({ responses }: { responses: (Response | Error)[] }) => {
	const calls: string[] = [];
	const waits: number[] = [];
	const warnings: string[] = [];
	const errors: string[] = [];
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
		error: (message: unknown) => {
			errors.push(String(message));
		},
	};
	return { calls, waits, warnings, errors, fetch, sleep, logger };
};

describe("ECS task identity", () => {
	test("off ECS it resolves at once with no service and no fetch", async () => {
		const harness = createHarness({ responses: [] });
		const identity = await resolveTaskIdentity({
			ctx: {
				logger: harness.logger,
				fetch: harness.fetch,
				sleep: harness.sleep,
			},
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
			ctx: {
				logger: harness.logger,
				fetch: harness.fetch,
				sleep: harness.sleep,
			},
			env: { ECS_CONTAINER_METADATA_URI_V4: metadataUri, IMAGE_TAG: "sha-1" },
		});
		expect(identity).toEqual({ serviceArn, imageSha: "sha-1" });
		expect(harness.calls).toEqual(Array(3).fill(`${metadataUri}/task`));
		expect(harness.waits).toEqual([500, 1_000]);
		expect(harness.warnings).toHaveLength(2);
		expect(harness.errors).toEqual([]);
	});

	test("after every attempt fails it refuses to start: a task without its identity would join the wrong group with an open gate", async () => {
		const harness = createHarness({
			responses: Array.from({ length: 5 }, () => new Error("ECONNREFUSED")),
		});
		await expect(
			resolveTaskIdentity({
				ctx: {
					logger: harness.logger,
					fetch: harness.fetch,
					sleep: harness.sleep,
				},
				env: { ECS_CONTAINER_METADATA_URI_V4: metadataUri },
			}),
		).rejects.toThrow("ECS task metadata unavailable after 5 attempts");
		expect(harness.calls).toHaveLength(5);
		expect(harness.waits).toEqual([500, 1_000, 2_000, 4_000]);
		expect(harness.warnings).toHaveLength(4);
	});

	test("on ECS-EC2 the bare cluster name takes region and account from the task ARN, giving the same service ARN and fleet", async () => {
		const ec2Cluster = "fc-balance-workers-ec2-dyl-xr2l4";
		const harness = createHarness({
			responses: [
				Response.json({
					Cluster: ec2Cluster,
					ServiceName: ec2Cluster,
					TaskARN: `arn:aws:ecs:us-east-1:001092881874:task/${ec2Cluster}/dfcd49e9a0074c7f8774ac6cbc55d11d`,
				}),
			],
		});
		const identity = await resolveTaskIdentity({
			ctx: {
				logger: harness.logger,
				fetch: harness.fetch,
				sleep: harness.sleep,
			},
			env: { ECS_CONTAINER_METADATA_URI_V4: metadataUri },
		});
		expect(identity.serviceArn).toBe(
			`arn:aws:ecs:us-east-1:001092881874:service/${ec2Cluster}/${ec2Cluster}`,
		);
		expect(fleetIdOf({ serviceArn: identity.serviceArn as string })).toBe(
			"4a70cfdc",
		);
	});

	test("metadata without a parseable cluster ARN is not retried, and refuses to start", async () => {
		const harness = createHarness({
			responses: [Response.json({ Cluster: "autumn", ServiceName: "x" })],
		});
		await expect(
			resolveTaskIdentity({
				ctx: {
					logger: harness.logger,
					fetch: harness.fetch,
					sleep: harness.sleep,
				},
				env: { ECS_CONTAINER_METADATA_URI_V4: metadataUri },
			}),
		).rejects.toThrow("names no service");
		expect(harness.calls).toHaveLength(1);
	});
});
