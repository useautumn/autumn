import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import axios from "axios";
import { bootRequestsForLocation } from "../../src/boot/bootRequests";
import {
	bootRequestKey,
	discardBootResponses,
	takeBootResponse,
} from "../../src/boot/bootResponses";

const paths = (pathname: string, search = "") =>
	bootRequestsForLocation({ pathname, search }).requests.map(
		({ method = "GET", path, body }) =>
			`${method} ${path}${body ? ` ${body}` : ""}`,
	);

describe("boot requests", () => {
	test("a customer entity view preloads the customer and the data its view waits on", () => {
		const result = bootRequestsForLocation({
			pathname: "/sandbox/customers/cus_1",
			search: "?entity_id=ent-1",
		});
		expect(result).toMatchObject({ env: "sandbox", route: "customer" });
		expect(paths("/sandbox/customers/cus_1", "?entity_id=ent-1")).toEqual([
			"GET /organization",
			"GET /products/features",
			"GET /customers/cus_1?entity_id=ent-1",
			"GET /customers/cus_1/products?start_cursor=&limit=10&status=active&entity_id=ent-1",
			'POST /v1/licenses.list {"customer_id":"cus_1","entity_id":"ent-1"}',
			"GET /products/license_products",
		]);
	});

	test("showing expired plans widens the customer fetch the same way the page does", () => {
		expect(
			paths("/customers/cus_1", "?customerProductsStatuses=active,expired"),
		).toContain("GET /customers/cus_1?include_expired_loose=true");
	});

	test("plan pages carry the requested version and a named sandbox keeps its slug", () => {
		const result = bootRequestsForLocation({
			pathname: "/sandbox/staging-box/products/pro",
			search: "?version=3",
		});
		expect(result).toMatchObject({
			env: "sandbox",
			sandboxSlug: "staging-box",
			route: "plan",
		});
		expect(result.requests.at(-1)?.path).toBe("/products/pro/data?version=3");
	});

	test("routes without a preload plan fetch nothing", () => {
		expect(
			bootRequestsForLocation({ pathname: "/sandbox/settings", search: "" })
				.requests,
		).toEqual([]);
		expect(
			bootRequestsForLocation({ pathname: "/customers/cus_1/x", search: "" })
				.requests,
		).toEqual([]);
	});
});

describe("boot response matching", () => {
	beforeAll(() => {
		// The keys resolve against the page origin; bun has no DOM here.
		globalThis.window ??= {
			location: { origin: "https://app.example.com" },
		} as unknown as Window & typeof globalThis;
	});

	afterEach(() => {
		window.__autumnBoot = undefined;
	});

	test("axios' URL for the same request produces the boot key", () => {
		const fromAxios = bootRequestKey({
			url: axios.getUri({
				baseURL: "/__autumn_api",
				url: "/customers/cus_1?entity_id=ent-1",
			}),
			env: "sandbox",
			apiVersion: "1.2",
		});
		const fromBoot = bootRequestKey({
			url: "/__autumn_api/customers/cus_1?entity_id=ent-1",
			env: "sandbox",
			apiVersion: "1.2",
		});
		expect(fromAxios).toBe(fromBoot);
		expect(bootRequestKey({ url: "/x", env: "live" })).not.toBe(
			bootRequestKey({ url: "/x", env: "sandbox" }),
		);
	});

	test("a boot response is handed out once and not after the page has loaded", () => {
		const response = Promise.resolve({ status: 200, headers: {}, body: "{}" });
		window.__autumnBoot = {
			startedAt: Date.now(),
			responses: new Map([["k", response]]),
		};
		expect(takeBootResponse("k")).toBe(response);
		expect(takeBootResponse("k")).toBeUndefined();

		window.__autumnBoot = {
			startedAt: Date.now() - 60_000,
			responses: new Map([["k", response]]),
		};
		expect(takeBootResponse("k")).toBeUndefined();
	});

	test("switching org discards responses fetched for the previous one", () => {
		window.__autumnBoot = {
			startedAt: Date.now(),
			responses: new Map([
				["k", Promise.resolve({ status: 200, headers: {}, body: "{}" })],
			]),
		};
		discardBootResponses();
		expect(takeBootResponse("k")).toBeUndefined();
	});
});
