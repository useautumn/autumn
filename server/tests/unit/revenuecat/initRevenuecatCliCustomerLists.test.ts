import { describe, expect, mock, test } from "bun:test";

const { initRevenuecatCli } = await import(
	"../../../src/external/revenueCat/misc/initRevenuecatCli.js"
);

const jsonResponse = (body: unknown) =>
	new Response(JSON.stringify(body), {
		status: 200,
		headers: { "Content-Type": "application/json" },
	});

// Two-page fixture: page 1 points to page 2 via next_page, page 2 terminates.
const twoPageFetch = (firstPageItems: unknown[], secondPageItems: unknown[]) => {
	let call = 0;
	const calls: string[] = [];
	const fetchImpl = mock((url: URL) => {
		calls.push(url.toString());
		call += 1;
		if (call === 1) {
			return Promise.resolve(
				jsonResponse({
					object: "list",
					items: firstPageItems,
					next_page: "/v2/next-page-token",
					url: "/v2/first",
				}),
			);
		}
		return Promise.resolve(
			jsonResponse({
				object: "list",
				items: secondPageItems,
				next_page: null,
				url: "/v2/second",
			}),
		);
	});
	return { fetchImpl: fetchImpl as unknown as typeof fetch, calls };
};

describe("initRevenuecatCli customer list pagination", () => {
	test("listCustomerSubscriptions paginates across two pages and concatenates items", async () => {
		const { fetchImpl, calls } = twoPageFetch(
			[{ object: "subscription", id: "sub_1", product_id: "prod_a" }],
			[{ object: "subscription", id: "sub_2", product_id: "prod_b" }],
		);

		const cli = initRevenuecatCli({
			projectId: "proj_1",
			accessToken: "tok",
			fetchImpl,
		});
		const subs = await cli.listCustomerSubscriptions("cust_1");

		expect(subs.map((s) => s.id)).toEqual(["sub_1", "sub_2"]);
		expect(calls[0]).toContain(
			"/v2/projects/proj_1/customers/cust_1/subscriptions?limit=100",
		);
		expect(calls[1]).toContain("/v2/next-page-token");
		expect(calls).toHaveLength(2);
	});

	test("listCustomerPurchases paginates across two pages and concatenates items", async () => {
		const { fetchImpl, calls } = twoPageFetch(
			[{ object: "purchase", id: "purch_1", product_id: "prod_a" }],
			[{ object: "purchase", id: "purch_2", product_id: "prod_b" }],
		);

		const cli = initRevenuecatCli({
			projectId: "proj_1",
			accessToken: "tok",
			fetchImpl,
		});
		const purchases = await cli.listCustomerPurchases("cust_1");

		expect(purchases.map((p) => p.id)).toEqual(["purch_1", "purch_2"]);
		expect(calls[0]).toContain(
			"/v2/projects/proj_1/customers/cust_1/purchases?limit=100",
		);
		expect(calls[1]).toContain("/v2/next-page-token");
		expect(calls).toHaveLength(2);
	});
});
