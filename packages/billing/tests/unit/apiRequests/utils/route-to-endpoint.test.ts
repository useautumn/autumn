import { describe, expect, test } from "bun:test";
import { apiRequestCatalog } from "../../../../src/apiRequests/apiRequestCatalog";
import { routeToEndpoint } from "../../../../src/apiRequests/utils/routeToEndpoint";

const HOST = "https://api.useautumn.com";

describe("routeToEndpoint", () => {
	test("every catalog route resolves to its own endpoint", () => {
		for (const endpoint of apiRequestCatalog) {
			for (const route of endpoint.routes) {
				const url = `${HOST}${route.path.replace(/\{[^}]+\}/g, "abc_123")}`;
				expect(routeToEndpoint({ method: route.method, url })?.id).toBe(
					endpoint.id,
				);
			}
		}
	});

	test("a {param} matches exactly one path segment", () => {
		expect(
			routeToEndpoint({ method: "GET", url: `${HOST}/v1/customers/cus_1` })?.id,
		).toBe("customers.get");
		expect(
			routeToEndpoint({
				method: "GET",
				url: `${HOST}/v1/customers/cus_1/entities/ent_2`,
			})?.id,
		).toBe("entities.get");
		expect(
			routeToEndpoint({
				method: "GET",
				url: `${HOST}/v1/customers/cus_1/products`,
			}),
		).toBeNull();
	});

	test("query strings and hosts are ignored", () => {
		expect(
			routeToEndpoint({ method: "POST", url: `${HOST}/v1/check?x=1` })?.id,
		).toBe("balances.check");
		expect(routeToEndpoint({ method: "post", url: "/v1/entitled" })?.id).toBe(
			"balances.check",
		);
	});

	test("path params accept any single segment an id can be", () => {
		for (const id of [
			"cus_1",
			"user@example.com",
			"a.b-c_d",
			"id%2Fwith%2Fslash",
			"12345",
		]) {
			expect(
				routeToEndpoint({ method: "GET", url: `/v1/customers/${id}` })?.id,
			).toBe("customers.get");
			expect(
				routeToEndpoint({
					method: "GET",
					url: `/v1/customers/${id}/entities/${id}`,
				})?.id,
			).toBe("entities.get");
		}
	});

	test("a param never swallows extra or missing segments", () => {
		expect(routeToEndpoint({ method: "GET", url: "/v1/customers" })).toBeNull();
		expect(
			routeToEndpoint({ method: "GET", url: "/v1/customers//" }),
		).toBeNull();
		expect(
			routeToEndpoint({
				method: "GET",
				url: "/v1/customers/cus_1/entities/ent_1/extra",
			}),
		).toBeNull();
	});

	test("wrong method or unlisted path is not metered", () => {
		expect(
			routeToEndpoint({ method: "GET", url: `${HOST}/v1/track` }),
		).toBeNull();
		expect(
			routeToEndpoint({ method: "POST", url: `${HOST}/v1/attach` }),
		).toBeNull();
	});
});
