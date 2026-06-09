import { beforeEach, describe, expect, mock, test } from "bun:test";
import { initRevenuecatCli } from "@/external/revenueCat/misc/initRevenuecatCli.js";

const mockFetch = mock(() =>
	Promise.resolve(
		new Response(JSON.stringify({ object: "list", items: [] }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		}),
	),
);

// Injected transport — the unit never touches global fetch.
const fetchImpl = mockFetch as unknown as typeof fetch;

const lastCall = () =>
	mockFetch.mock.calls[mockFetch.mock.calls.length - 1] as unknown as [
		string,
		RequestInit,
	];

describe("initRevenuecatCli product/app methods", () => {
	beforeEach(() => {
		mockFetch.mockClear();
	});

	test("listApps GETs project apps and returns items", async () => {
		mockFetch.mockImplementationOnce(() =>
			Promise.resolve(
				new Response(
					JSON.stringify({
						object: "list",
						items: [{ object: "app", id: "app_1", type: "app_store" }],
					}),
					{ status: 200, headers: { "Content-Type": "application/json" } },
				),
			),
		);

		const cli = initRevenuecatCli({ projectId: "proj_1", accessToken: "tok", fetchImpl });
		const apps = await cli.listApps();

		const [url, init] = lastCall();
		expect(url.toString()).toContain(
			"https://api.revenuecat.com/v2/projects/proj_1/apps",
		);
		expect(init?.method ?? "GET").toBe("GET");
		expect(apps).toHaveLength(1);
		expect(apps[0].id).toBe("app_1");
	});

	test("createProduct POSTs the body and returns the product", async () => {
		mockFetch.mockImplementationOnce(() =>
			Promise.resolve(
				new Response(
					JSON.stringify({ object: "product", id: "prod_1" }),
					{ status: 201, headers: { "Content-Type": "application/json" } },
				),
			),
		);

		const cli = initRevenuecatCli({ projectId: "proj_1", accessToken: "tok", fetchImpl });
		const result = await cli.createProduct({
			app_id: "app_1",
			store_identifier: "autumn.live.acme.pro",
			type: "subscription",
			display_name: "Pro",
			subscription: { duration: "P1M" },
		});

		const [url, init] = lastCall();
		expect(url.toString()).toBe(
			"https://api.revenuecat.com/v2/projects/proj_1/products",
		);
		expect(init.method).toBe("POST");
		expect(JSON.parse(init.body as string)).toMatchObject({
			app_id: "app_1",
			store_identifier: "autumn.live.acme.pro",
			type: "subscription",
			subscription: { duration: "P1M" },
		});
		expect(result.id).toBe("prod_1");
	});

	test("updateProduct POSTs display_name to the product url", async () => {
		mockFetch.mockImplementationOnce(() =>
			Promise.resolve(
				new Response(JSON.stringify({ object: "product", id: "prod_1" }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
			),
		);

		const cli = initRevenuecatCli({ projectId: "proj_1", accessToken: "tok", fetchImpl });
		await cli.updateProduct("prod_1", { display_name: "Pro Plus" });

		const [url, init] = lastCall();
		expect(url.toString()).toBe(
			"https://api.revenuecat.com/v2/projects/proj_1/products/prod_1",
		);
		expect(init.method).toBe("POST");
		expect(JSON.parse(init.body as string)).toEqual({
			display_name: "Pro Plus",
		});
	});

	test("createInStore POSTs store_information to the create_in_store url", async () => {
		mockFetch.mockImplementationOnce(() =>
			Promise.resolve(
				new Response(JSON.stringify({ created_product: { id: "1" } }), {
					status: 201,
					headers: { "Content-Type": "application/json" },
				}),
			),
		);

		const cli = initRevenuecatCli({ projectId: "proj_1", accessToken: "tok", fetchImpl });
		await cli.createInStore("prod_1", {
			store_information: {
				duration: "ONE_MONTH",
				subscription_group_name: "Autumn - Default Group",
			},
		});

		const [url, init] = lastCall();
		expect(url.toString()).toBe(
			"https://api.revenuecat.com/v2/projects/proj_1/products/prod_1/create_in_store",
		);
		expect(init.method).toBe("POST");
		expect(JSON.parse(init.body as string)).toEqual({
			store_information: {
				duration: "ONE_MONTH",
				subscription_group_name: "Autumn - Default Group",
			},
		});
	});
});
