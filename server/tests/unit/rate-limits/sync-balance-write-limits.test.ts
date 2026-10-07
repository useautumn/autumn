import { describe, expect, test } from "bun:test";
import { ApiVersion, ApiVersionClass } from "@autumn/shared";
import { resolveRateLimitPolicy } from "@/internal/misc/rateLimiter/policies/resolveRateLimitPolicy.js";

const layerNamesFor = ({
	spec,
	apiVersion,
	body,
}: {
	spec: string;
	apiVersion: ApiVersion;
	body: Record<string, unknown>;
}) => {
	const [method, path] = spec.split(" ");
	const { perOrg, perCustomer } = resolveRateLimitPolicy({
		method,
		path,
		ctx: { apiVersion: new ApiVersionClass(apiVersion), requestBody: body },
	});
	return [perOrg?.name, perCustomer?.name];
};

const SYNC_WRITE_LAYERS = ["sync_balance_write_org", "sync_balance_write"];
const TRACK_LAYERS = ["track_org", "track"];
const CHECK_LAYERS = ["check_org", "check"];

const TRACK_SPECS = [
	"POST /v1/balances.track",
	"POST /v1/track",
	"POST /v1/events",
	"POST /v1/balances.track_tokens",
	"POST /v1/track_tokens",
];
const CHECK_SPECS = [
	"POST /v1/balances.check",
	"POST /v1/check",
	"POST /v1/entitled",
];
const lockBody = { lock: { enabled: true, lock_id: "lock_1" } };

describe("2.5 synchronous balance write limits", () => {
	test("track and track_tokens with async: false use the sync write layers", () => {
		for (const spec of TRACK_SPECS) {
			expect(
				layerNamesFor({
					spec,
					apiVersion: ApiVersion.V2_5,
					body: { async: false },
				}),
			).toEqual(SYNC_WRITE_LAYERS);
		}
	});

	test("default and async: true track keep the track layers", () => {
		for (const spec of TRACK_SPECS) {
			for (const body of [{}, { async: true }]) {
				expect(
					layerNamesFor({ spec, apiVersion: ApiVersion.V2_5, body }),
				).toEqual(TRACK_LAYERS);
			}
		}
	});

	test("check with lock or send_event uses the sync write layers", () => {
		for (const spec of CHECK_SPECS) {
			for (const body of [lockBody, { send_event: true }]) {
				expect(
					layerNamesFor({ spec, apiVersion: ApiVersion.V2_5, body }),
				).toEqual(SYNC_WRITE_LAYERS);
			}
		}
	});

	test("a plain check keeps the check layers", () => {
		for (const spec of CHECK_SPECS) {
			for (const body of [{}, { send_event: false }]) {
				expect(
					layerNamesFor({ spec, apiVersion: ApiVersion.V2_5, body }),
				).toEqual(CHECK_LAYERS);
			}
		}
	});

	test("2.4 and older are unchanged for sync writes", () => {
		for (const apiVersion of [ApiVersion.V2_4, ApiVersion.V1_2]) {
			for (const spec of TRACK_SPECS) {
				expect(
					layerNamesFor({ spec, apiVersion, body: { async: false } }),
				).toEqual(TRACK_LAYERS);
			}
			for (const spec of CHECK_SPECS) {
				for (const body of [lockBody, { send_event: true }]) {
					expect(layerNamesFor({ spec, apiVersion, body })).toEqual(
						CHECK_LAYERS,
					);
				}
			}
		}
	});

	test("balance updates and finalize never use the sync write layers", () => {
		for (const spec of [
			"POST /v1/balances.update",
			"POST /v1/balances.finalize",
			"POST /v1/usage",
		]) {
			expect(
				layerNamesFor({
					spec,
					apiVersion: ApiVersion.V2_5,
					body: { async: false },
				}),
			).toEqual(TRACK_LAYERS);
		}
	});

	test("track and check share one counter per layer: 500/s per customer, 120k/min per org, Redis, 429", () => {
		const ctx = (requestBody: Record<string, unknown>) => ({
			apiVersion: new ApiVersionClass(ApiVersion.V2_5),
			requestBody,
		});
		const track = resolveRateLimitPolicy({
			method: "POST",
			path: "/v1/balances.track",
			ctx: ctx({ async: false }),
		});
		const check = resolveRateLimitPolicy({
			method: "POST",
			path: "/v1/balances.check",
			ctx: ctx(lockBody),
		});

		expect(check.perCustomer).toBe(track.perCustomer);
		expect(check.perOrg).toBe(track.perOrg);
		expect(track.perCustomer).toMatchObject({ limit: 500, windowMs: 1000 });
		expect(track.perOrg).toMatchObject({ limit: 120_000, windowMs: 60_000 });
		for (const layer of [track.perCustomer, track.perOrg]) {
			expect(layer?.counted ?? "allPods").toBe("allPods");
			expect(layer?.overLimit ?? "reject").toBe("reject");
		}
	});

	test("resolving without a request ctx skips body-gated rows", () => {
		const { perCustomer } = resolveRateLimitPolicy({
			method: "POST",
			path: "/v1/balances.track",
		});
		expect(perCustomer?.name).toBe("track");
	});
});
