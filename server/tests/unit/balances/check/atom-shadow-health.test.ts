import { afterAll, expect, test } from "bun:test";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	_resetShadowAtomHealthSamplingForTesting,
	sampleShadowAtomHealth,
} from "@/internal/balances/check/atomShadow/sampleShadowAtomHealth.js";

const health = {
	status: "alive",
	bootedAt: "2026-10-13T00:00:00.000Z",
	threads: [{ index: 0, checks: 10, loopLagMs: 1 }],
	container: { cpuUsageSeconds: 12.5, cpuLimitCores: 3 },
};
let reads = 0;
const atom = Bun.serve({
	port: 0,
	fetch: (request) => {
		if (new URL(request.url).pathname !== "/health")
			return new Response(null, { status: 404 });
		reads++;
		return Response.json(health);
	},
});
afterAll(() => atom.stop(true));

test("a process logs the shadow Atom's /health at most once per period, however many checks it shadows", async () => {
	const logged: Record<string, unknown>[] = [];
	const ctx = {
		logger: {
			info: (_message: string, meta: Record<string, unknown>) =>
				void logged.push(meta),
		},
	} as unknown as AutumnContext;
	_resetShadowAtomHealthSamplingForTesting();

	for (let i = 0; i < 20; i++)
		sampleShadowAtomHealth({ ctx, endpointUrl: atom.url.origin });
	for (let waited = 0; logged.length === 0 && waited < 1_000; waited += 10)
		await Bun.sleep(10);

	expect(reads).toBe(1);
	expect(logged).toEqual([
		{
			type: "atom_shadow_health",
			status_code: 200,
			latency_ms: expect.any(Number),
			health,
		},
	]);
});
