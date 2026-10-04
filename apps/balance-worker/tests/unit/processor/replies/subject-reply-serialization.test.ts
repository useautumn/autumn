/**
 * Replies are serialised by reusing each unchanged row's JSON. The wire must not move: every reply a
 * run of tracks and checks produces serialises byte for byte as JSON.stringify would, as do the routes.
 */

import { describe, expect, test } from "bun:test";
import {
	type CheckCommand,
	parseCheckCommand,
	type TrackCommand,
} from "@autumn/balance-engine";
import type { TrackBatchItemResult } from "@autumn/balance-worker-client/protocol";
import { createBalanceWorkerApp } from "../../../../src/http/createBalanceWorkerApp.js";
import type { BalanceWorkerRequestContext } from "../../../../src/http/types/balanceWorkerHttp.js";
import { getBalanceWorkerLogger } from "../../../../src/logging/getBalanceWorkerLogger.js";
import {
	serializeSubjectReply,
	serializeTrackBatchReply,
} from "../../../../src/processor/replies/serializeSubjectReply.js";
import { createBenchProcessor } from "../../../benchmarks/track-throughput/createBenchProcessor.js";
import { scenarios } from "../../../benchmarks/track-throughput/scenarios.js";
import {
	createInitializeRequest,
	createTrackCommand,
	testIdentity,
	testOrg,
} from "../../../fixtures/mutations.js";

const identity = { ...testIdentity, customerId: "cus_0" };
const startedAt = 1_700_000_000_000;

const trackOf = ({
	n,
	featureId,
	value,
}: {
	n: number;
	featureId: string;
	value: number;
}): TrackCommand =>
	createTrackCommand({
		identity,
		commandId: `trk_${n}`,
		featureId,
		value,
		occurredAt: startedAt + n,
	});

const checkOf = ({
	n,
	featureId,
}: {
	n: number;
	featureId: string;
}): CheckCommand =>
	parseCheckCommand({
		input: {
			schemaVersion: 1,
			type: "check",
			org: testOrg,
			requestId: `req_chk_${n}`,
			identity,
			featureId,
			internalFeatureId: `feat_${featureId}`,
			requiredBalance: 1 + (n % 3),
			properties: null,
			occurredAt: startedAt + n,
		},
	});

const processorFor = async ({ scenario }: { scenario: string }) => {
	const fixture = scenarios[scenario];
	if (!fixture) throw new Error(`Unknown scenario ${scenario}`);
	const bench = await createBenchProcessor({
		scenario: fixture,
		partition: 0,
		latency: { appendMs: 0, applyMs: 0 },
		serialize: false,
	});
	await bench.processor.initialize({
		request: createInitializeRequest({
			state: fixture.stateFor({ identity }),
			commandId: "init_0",
			requestId: "req_init_0",
		}),
	});
	return { processor: bench.processor, features: fixture.features };
};

describe("subject reply serialisation", () => {
	for (const scenario of ["small", "typical", "heavy"])
		test(`every track and check reply is byte-identical to JSON.stringify (${scenario})`, async () => {
			const { processor, features } = await processorFor({ scenario });
			for (let n = 0; n < 400; n++) {
				const featureId = features[n % features.length] ?? "";
				const reply =
					n % 4 === 3
						? await processor.check({ command: checkOf({ n, featureId }) })
						: await processor.track({
								command: trackOf({ n, featureId, value: 1 + (n % 5) }),
							});
				expect(serializeSubjectReply({ reply })).toBe(JSON.stringify(reply));
			}
		});

	test("a batch with failures serialises as JSON.stringify({ results })", async () => {
		const { processor, features } = await processorFor({ scenario: "typical" });
		const results: TrackBatchItemResult[] = [];
		for (let n = 0; n < 20; n++) {
			const featureId = features[n % features.length] ?? "";
			results.push({
				ok: true,
				reply: await processor.track({
					command: trackOf({ n, featureId, value: 1 }),
				}),
			});
			results.push({
				ok: false,
				status: 503,
				error: { code: "OVERLOADED", message: "busy" },
			});
		}
		expect(serializeTrackBatchReply({ results })).toBe(
			JSON.stringify({ results }),
		);
	});

	test("values JSON.stringify leaves out or rewrites are left out or rewritten the same way", () => {
		const shared = { id: "row_1", at: new Date(0), note: undefined };
		const reply = {
			result: { type: "track", missing: undefined },
			skipped: undefined,
			state: {
				schemaVersion: 1,
				customer: shared,
				entity: null,
				customerEntitlements: [shared, shared],
				fn: () => 1,
			},
			catalog: { entitlements: { a: shared }, prices: {} },
			effects: [],
		};
		expect(serializeSubjectReply({ reply })).toBe(JSON.stringify(reply));
		expect(serializeSubjectReply({ reply })).toBe(JSON.stringify(reply));
	});

	test("/v1/track and /v1/track-batch answer with the same JSON the processor's replies stringify to", async () => {
		const { processor, features } = await processorFor({ scenario: "typical" });
		const runtime: BalanceWorkerRequestContext["runtime"] = {
			process: (run) => run(processor),
		};
		const app = createBalanceWorkerApp({
			ctx: {
				ownership: { findRuntime: () => runtime },
				partitionResolver: { partitionForIdentity: () => 0 },
				logger: getBalanceWorkerLogger(),
			},
		});
		const route = { partition: 0, routeEpoch: "1" };
		const single = await app.request("/v1/track", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				route,
				command: trackOf({ n: 0, featureId: features[0] ?? "", value: 1 }),
			}),
		});
		expect(single.status).toBe(200);
		expect(single.headers.get("content-type")).toBe("application/json");
		const singleBody = await single.text();
		expect(JSON.stringify(JSON.parse(singleBody))).toBe(singleBody);
		expect(JSON.parse(singleBody).result.type).toBe("track");

		const batch = await app.request("/v1/track-batch", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				route,
				commands: [
					trackOf({ n: 1, featureId: features[1] ?? "", value: 1 }),
					{ schemaVersion: 1, type: "nope" },
				],
			}),
		});
		expect(batch.status).toBe(200);
		expect(batch.headers.get("content-type")).toBe("application/json");
		const batchBody = await batch.text();
		expect(JSON.stringify(JSON.parse(batchBody))).toBe(batchBody);
		const { results } = JSON.parse(batchBody);
		expect(results.map((result: { ok: boolean }) => result.ok)).toEqual([
			true,
			false,
		]);
	});
});
