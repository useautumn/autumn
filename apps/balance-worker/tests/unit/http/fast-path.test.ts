/**
 * Track and check skip the router for a thin fast path. It must answer every request exactly as the full
 * app does: same status, same content type, same bytes, for successes, refusals and malformed input alike.
 */

import { describe, expect, test } from "bun:test";
import { parseCheckCommand } from "@autumn/balance-engine";
import { createBalanceWorkerApp } from "../../../src/http/createBalanceWorkerApp.js";
import { createBalanceWorkerFetch } from "../../../src/http/fastPath/createBalanceWorkerFetch.js";
import type {
	BalanceWorkerHttpContext,
	BalanceWorkerRequestContext,
} from "../../../src/http/types/balanceWorkerHttp.js";
import type { PartitionProcessor } from "../../../src/processor/types/partitionProcessor.js";
import { PartitionWriterCapacityError } from "../../../src/processor/writer/writerErrors.js";
import { createBenchProcessor } from "../../benchmarks/track-throughput/createBenchProcessor.js";
import { scenarios } from "../../benchmarks/track-throughput/scenarios.js";
import {
	createInitializeRequest,
	createTrackCommand,
	testIdentity,
	testOrg,
} from "../../fixtures/mutations.js";

const identity = { ...testIdentity, customerId: "cus_0" };
const route = { partition: 0, routeEpoch: "1" };
const scenario = scenarios.typical;
const featureId = scenario?.features[0] ?? "";

const trackOf = (n: number) =>
	createTrackCommand({
		identity,
		commandId: `trk_${n}`,
		featureId,
		value: 1,
		occurredAt: 1_700_000_000_000 + n,
	});

const checkOf = (n: number) =>
	parseCheckCommand({
		input: {
			schemaVersion: 1,
			type: "check",
			org: testOrg,
			requestId: `req_chk_${n}`,
			identity,
			featureId,
			internalFeatureId: `feat_${featureId}`,
			requiredBalance: 1,
			properties: null,
			occurredAt: 1_700_000_000_000 + n,
		},
	});

/** One app and one fast fetch over the same processor, or over a processor that refuses every track. */
const servers = async ({ refuses = false }: { refuses?: boolean } = {}) => {
	if (!scenario) throw new Error("typical scenario");
	const bench = await createBenchProcessor({
		scenario,
		partition: 0,
		latency: { appendMs: 0, applyMs: 0 },
		serialize: false,
	});
	await bench.processor.initialize({
		request: createInitializeRequest({
			state: scenario.stateFor({ identity }),
			commandId: "init_0",
			requestId: "req_init_0",
		}),
	});
	const processor: PartitionProcessor = refuses
		? {
				...bench.processor,
				track: async () => {
					throw new PartitionWriterCapacityError();
				},
			}
		: bench.processor;
	const runtime: BalanceWorkerRequestContext["runtime"] = {
		process: (run) => run(processor),
	};
	const ctx: BalanceWorkerHttpContext = {
		ownership: {
			findRuntime: (requested) =>
				requested.partition === route.partition &&
				requested.routeEpoch === route.routeEpoch
					? runtime
					: undefined,
		},
		partitionResolver: { partitionForIdentity: () => 0 },
		logger: { debug() {}, info() {}, warn() {}, error() {} },
	};
	const app = createBalanceWorkerApp({ ctx });
	return { app, fast: createBalanceWorkerFetch({ ctx, app }) };
};

type Sent = { path: string; body: string; headers?: Record<string, string> };

const requestOf = ({ path, body, headers }: Sent) =>
	new Request(`http://worker${path}`, {
		method: "POST",
		headers: { "content-type": "application/json", ...headers },
		body,
	});

const answerOf = async (response: Response) => ({
	status: response.status,
	contentType: response.headers.get("content-type"),
	body: await response.text(),
});

const envelope = (command: unknown, overrides: object = {}) =>
	JSON.stringify({ route, command, ...overrides });

describe("track and check fast path", () => {
	test("answers every request byte for byte as the full app", async () => {
		// Two processors in lockstep: each request reaches both, so each decides on the same state.
		const viaApp = await servers();
		const viaFast = await servers();
		const sent: Sent[] = [
			{ path: "/v1/track", body: envelope(trackOf(1)) },
			{ path: "/v1/check", body: envelope(checkOf(2)) },
			{ path: "/v1/track?probe=1", body: envelope(trackOf(3)) },
			{ path: "/v1/track", body: envelope(trackOf(1)) },
			{
				path: "/v1/track",
				body: envelope(trackOf(4)),
				headers: { "x-request-budget-ms": "250" },
			},
			{
				path: "/v1/track",
				body: JSON.stringify({
					route: { partition: 0, routeEpoch: "2" },
					command: trackOf(5),
				}),
			},
			{
				path: "/v1/track",
				body: JSON.stringify({
					route: { partition: 3, routeEpoch: "1" },
					command: trackOf(6),
				}),
			},
			{ path: "/v1/track", body: envelope(checkOf(7)) },
			{ path: "/v1/check", body: envelope(trackOf(8)) },
			{ path: "/v1/track", body: envelope(trackOf(9), { payload: {} }) },
			{ path: "/v1/track", body: "{not json" },
			{ path: "/v1/track", body: "" },
			{ path: "/v1/track", body: JSON.stringify({ route }) },
			{
				path: "/v1/track",
				body: envelope(trackOf(10)),
				headers: { "content-type": "text/plain" },
			},
		];
		for (const request of sent)
			expect(await answerOf(await viaFast.fast(requestOf(request)))).toEqual(
				await answerOf(await viaApp.app.fetch(requestOf(request))),
			);
	});

	test("a refusal answers the same error body and status", async () => {
		const viaApp = await servers({ refuses: true });
		const viaFast = await servers({ refuses: true });
		const request = { path: "/v1/track", body: envelope(trackOf(1)) };
		const fast = await answerOf(await viaFast.fast(requestOf(request)));
		expect(fast).toEqual(
			await answerOf(await viaApp.app.fetch(requestOf(request))),
		);
		expect(JSON.parse(fast.body).error.code).toBe("OVERLOADED");
	});
});
