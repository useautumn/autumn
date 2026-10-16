import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createAlienClient } from "../../src/createAlienClient.js";
import type { AlienDeployment } from "../../src/types/alienClient.js";

type Recorded = { method: string; path: string; body: unknown };

let requests: Recorded[] = [];
const realFetch = globalThis.fetch;

const deployment: AlienDeployment = { id: "dep_1", status: "running" };

beforeEach(() => {
	requests = [];
	globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
		const url = new URL(String(input));
		requests.push({
			method: init?.method ?? "GET",
			path: url.pathname,
			body: init?.body ? JSON.parse(String(init.body)) : undefined,
		});
		return new Response("{}", {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	}) as typeof fetch;
});

afterEach(() => {
	globalThis.fetch = realFetch;
});

const hostedClient = () =>
	createAlienClient({
		config: {
			kind: "hosted",
			apiKey: "key",
			project: "autumn-staging",
			workspace: "autumn",
		},
		logger: { warn: () => {} },
	});

describe("a deployment's compute update", () => {
	test("sends each container's allocation beside its pool's machines", async () => {
		await hostedClient().updateDeploymentCompute({
			deployment,
			pools: { stateful: { machine: "c8g.2xlarge", machines: 2 } },
			containers: { atom: { cpu: 7, memory: "12Gi" } },
		});

		expect(requests).toEqual([
			{
				method: "PATCH",
				path: "/v1/deployments/dep_1/compute",
				body: {
					compute: {
						pools: {
							stateful: {
								mode: "fixed",
								machines: 2,
								machine: "c8g.2xlarge",
								failure_domains: { spread: 1 },
							},
						},
						containers: { atom: { cpu: 7, memory: "12Gi" } },
					},
				},
			},
		]);
	});

	test("the local manager runs no machines, so nothing is sent", async () => {
		await createAlienClient({
			config: { kind: "local", baseUrl: "http://localhost:9090" },
			logger: { warn: () => {} },
		}).updateDeploymentCompute({
			deployment,
			pools: { stateful: { machine: "c8g.large", machines: 2 } },
			containers: { atom: { cpu: 1, memory: "2.75Gi" } },
		});

		expect(requests).toHaveLength(0);
	});
});
