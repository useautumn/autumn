import { describe, expect, test } from "bun:test";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	readMeteringWorkerUrl,
	resolveMeteringRouting,
	resolveMeteringRoutingMode,
	routesChecks,
	routesTracks,
} from "@/internal/metering/routing/meteringRouting.js";
import {
	fetchMeteringWorkerCheck,
	type MeteringWorkerFetch,
	postMeteringWorkerTrack,
} from "@/internal/metering/routing/meteringWorkerClient.js";
import {
	type MeteringRoutingConfig,
	MeteringRoutingConfigSchema,
} from "@/internal/misc/meteringRouting/meteringRoutingSchemas.js";

const WORKER_URL = "http://metering-worker.internal:8080";

const configOf = (
	config: Partial<MeteringRoutingConfig> = {},
): MeteringRoutingConfig => MeteringRoutingConfigSchema.parse(config);

/** Routing only reads the org off the context, so the rest stays out of the
 *  way of what is under test. */
const contextFor = ({
	orgId = "org_1",
	orgSlug,
}: {
	orgId?: string;
	orgSlug?: string;
} = {}) => ({ org: { id: orgId, slug: orgSlug } }) as unknown as AutumnContext;

const fetchReturning = ({
	status = 200,
	body,
	throws,
}: {
	status?: number;
	body?: unknown;
	throws?: Error;
}): { fetchImpl: MeteringWorkerFetch; calls: string[] } => {
	const calls: string[] = [];

	const fetchImpl = (async (input: unknown) => {
		calls.push(String(input));
		if (throws) throw throws;

		return new Response(body === undefined ? "" : JSON.stringify(body), {
			status,
			headers: { "Content-Type": "application/json" },
		});
	}) as MeteringWorkerFetch;

	return { fetchImpl, calls };
};

describe("metering routing config", () => {
	test("an empty config routes nothing", () => {
		expect(configOf()).toEqual({ orgModes: {}, defaultMode: "off" });
	});

	test("an org cannot be listed as off — it is removed instead", () => {
		expect(
			MeteringRoutingConfigSchema.safeParse({ orgModes: { org_1: "off" } })
				.success,
		).toBe(false);
	});
});

describe("metering worker url", () => {
	test("an absent or blank env var means no worker", () => {
		expect(readMeteringWorkerUrl({ env: {} })).toBeNull();
		expect(
			readMeteringWorkerUrl({ env: { METERING_WORKER_URL: "   " } }),
		).toBeNull();
	});

	test("trailing slashes are stripped so paths concatenate cleanly", () => {
		expect(
			readMeteringWorkerUrl({
				env: { METERING_WORKER_URL: ` ${WORKER_URL}// ` },
			}),
		).toBe(WORKER_URL);
	});
});

describe("metering routing mode resolution", () => {
	test("the org entry wins, then the slug entry, then the default", () => {
		const config = configOf({
			orgModes: { org_1: "full", acme: "serve_reads" },
			defaultMode: "shadow",
		});

		expect(
			resolveMeteringRoutingMode({ config, orgId: "org_1", orgSlug: "acme" }),
		).toBe("full");
		expect(
			resolveMeteringRoutingMode({ config, orgId: "org_2", orgSlug: "acme" }),
		).toBe("serve_reads");
		expect(
			resolveMeteringRoutingMode({ config, orgId: "org_2", orgSlug: "other" }),
		).toBe("shadow");
	});

	test("serve_reads routes checks only; full routes both", () => {
		expect(routesChecks({ mode: "serve_reads" })).toBeTrue();
		expect(routesTracks({ mode: "serve_reads" })).toBeFalse();
		expect(routesChecks({ mode: "full" })).toBeTrue();
		expect(routesTracks({ mode: "full" })).toBeTrue();

		for (const mode of ["off", "shadow"] as const) {
			expect(routesChecks({ mode })).toBeFalse();
			expect(routesTracks({ mode })).toBeFalse();
		}
	});

	test("without the env var no config can route anything", () => {
		expect(
			resolveMeteringRouting({
				ctx: contextFor(),
				config: configOf({ orgModes: { org_1: "full" }, defaultMode: "full" }),
				workerUrl: null,
			}),
		).toEqual({ mode: "off", workerUrl: null });
	});

	test("with the env var but no config the org still routes nowhere", () => {
		expect(
			resolveMeteringRouting({
				ctx: contextFor(),
				config: configOf(),
				workerUrl: WORKER_URL,
			}),
		).toEqual({ mode: "off", workerUrl: null });
	});

	test("shadow mode serves exactly like off", () => {
		expect(
			resolveMeteringRouting({
				ctx: contextFor(),
				config: configOf({ orgModes: { org_1: "shadow" } }),
				workerUrl: WORKER_URL,
			}),
		).toEqual({ mode: "shadow", workerUrl: null });
	});

	test("a routing mode hands the caller the url it may use", () => {
		expect(
			resolveMeteringRouting({
				ctx: contextFor(),
				config: configOf({ orgModes: { org_1: "serve_reads" } }),
				workerUrl: WORKER_URL,
			}),
		).toEqual({ mode: "serve_reads", workerUrl: WORKER_URL });
	});
});

describe("metering worker check client", () => {
	test("returns the folded balance and verdict", async () => {
		const { fetchImpl, calls } = fetchReturning({
			body: { balance: 42, allowed: true },
		});

		expect(
			await fetchMeteringWorkerCheck({
				workerUrl: WORKER_URL,
				orgId: "org 1",
				env: "sandbox",
				customerId: "cus 1",
				featureId: "messages",
				fetchImpl,
			}),
		).toEqual({ balance: 42, allowed: true });
		expect(calls[0]).toBe(
			`${WORKER_URL}/check?org_id=org%201&env=sandbox&customer_id=cus%201&feature_id=messages`,
		);
	});

	test("every failure collapses to null so the caller has one branch", async () => {
		const failures = [
			fetchReturning({ status: 500, body: { balance: 42, allowed: true } }),
			fetchReturning({ throws: new Error("ECONNREFUSED") }),
			fetchReturning({ body: { balance: "nope", allowed: true } }),
			fetchReturning({ body: { balance: 42 } }),
			fetchReturning({ body: undefined }),
		];

		for (const { fetchImpl } of failures) {
			expect(
				await fetchMeteringWorkerCheck({
					workerUrl: WORKER_URL,
					orgId: "org_1",
					env: "sandbox",
					customerId: "cus_1",
					featureId: "messages",
					fetchImpl,
				}),
			).toBeNull();
		}
	});

	test("a timeout is a failure, not a thrown abort", async () => {
		const fetchImpl = ((_input: unknown, init?: RequestInit) =>
			new Promise((_resolve, reject) => {
				init?.signal?.addEventListener("abort", () =>
					reject(new Error("aborted")),
				);
			})) as MeteringWorkerFetch;

		expect(
			await fetchMeteringWorkerCheck({
				workerUrl: WORKER_URL,
				orgId: "org_1",
				env: "sandbox",
				customerId: "cus_1",
				featureId: "messages",
				timeoutMs: 5,
				fetchImpl,
			}),
		).toBeNull();
	});
});

describe("metering worker track client", () => {
	const body = {
		org_id: "org_1",
		env: "sandbox",
		customer_id: "cus_1",
		feature_id: "messages",
		value: 3,
		idempotency_key: "track:req_1",
	};

	test("returns the verdict and carries the duplicate flag through", async () => {
		const { fetchImpl } = fetchReturning({
			body: { balance: 70, allowed: true, duplicate: true },
		});

		expect(
			await postMeteringWorkerTrack({
				workerUrl: WORKER_URL,
				body,
				fetchImpl,
			}),
		).toEqual({ balance: 70, allowed: true, duplicate: true });
	});

	test("a non-duplicate reply omits the flag rather than reporting false", async () => {
		const { fetchImpl } = fetchReturning({
			body: { balance: 70, allowed: true, duplicate: false },
		});

		expect(
			await postMeteringWorkerTrack({
				workerUrl: WORKER_URL,
				body,
				fetchImpl,
			}),
		).toEqual({ balance: 70, allowed: true });
	});

	test("a worker that cannot append is a null, so the caller falls back", async () => {
		const { fetchImpl } = fetchReturning({
			status: 502,
			body: { error: "broker down" },
		});

		expect(
			await postMeteringWorkerTrack({
				workerUrl: WORKER_URL,
				body,
				fetchImpl,
			}),
		).toBeNull();
	});

	test("a network error never escapes the client", async () => {
		const { fetchImpl } = fetchReturning({ throws: new Error("boom") });

		expect(
			await postMeteringWorkerTrack({
				workerUrl: WORKER_URL,
				body,
				fetchImpl,
			}),
		).toBeNull();
	});
});
