import { describe, expect, test } from "bun:test";
import {
	parseShadowDiffPairs,
	runShadowDiff,
	waitForWorkerCatchUp,
} from "@/internal/metering/shadowDiff/runShadowDiff.js";

const pairsJson = JSON.stringify([
	{
		org_id: "org_1",
		env: "live",
		customer_id: "cus_1",
		feature_id: "messages",
	},
	{
		org_id: "org_1",
		env: "live",
		customer_id: "cus_2",
		feature_id: "credits",
	},
]);

describe("metering shadow diff", () => {
	test("parses exact pairs without creating a customer-feature cross product", () => {
		expect(parseShadowDiffPairs({ raw: pairsJson })).toEqual([
			{
				org_id: "org_1",
				env: "live",
				customer_id: "cus_1",
				feature_id: "messages",
			},
			{
				org_id: "org_1",
				env: "live",
				customer_id: "cus_2",
				feature_id: "credits",
			},
		]);
	});

	test("reports the failing side, HTTP status, and body when a pair is unreachable", async () => {
		const requestedUrls: string[] = [];
		const fetchImpl = (async (input: string | URL | Request) => {
			const url = String(input);
			requestedUrls.push(url);
			if (url.startsWith("http://worker")) {
				return new Response('{"error":"worker_catching_up"}', { status: 503 });
			}
			return new Response('{"message":"invalid key"}', { status: 401 });
		}) as typeof fetch;

		const summary = await runShadowDiff({
			pairs: parseShadowDiffPairs({ raw: pairsJson }).slice(0, 1),
			workerUrl: "http://worker",
			apiBase: "https://api-staging.useautumn.com",
			apiKey: "test-key",
			fetchImpl,
		});

		expect(requestedUrls[0]).toContain(
			"org_id=org_1&env=live&customer_id=cus_1&feature_id=messages",
		);
		expect(summary).toMatchObject({
			pairs: 1,
			unreachable: 1,
			unreachable_details: [
				{
					customer: "cus_1",
					feature: "messages",
					worker: { status: 503, error: "worker_catching_up" },
					api: { status: 401, error: "invalid key" },
				},
			],
		});
	});

	test("pins and waits for the worker's post-traffic high watermark", async () => {
		const requested: string[] = [];
		let healthRequests = 0;
		const fetchImpl = (async (input: string | URL | Request) => {
			const url = String(input);
			requested.push(url);
			if (url.endsWith("/catch-up")) {
				return new Response('{"status":"catching_up"}', { status: 202 });
			}
			healthRequests++;
			return new Response(
				healthRequests === 1 ? '{"status":"catching_up"}' : '{"status":"ok"}',
				{ status: healthRequests === 1 ? 503 : 200 },
			);
		}) as typeof fetch;

		await waitForWorkerCatchUp({
			workerUrl: "http://worker",
			fetchImpl,
			sleep: async () => {},
		});

		expect(requested).toEqual([
			"http://worker/catch-up",
			"http://worker/healthz",
			"http://worker/healthz",
		]);
	});
});
