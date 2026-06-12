import { beforeEach, describe, expect, mock, test } from "bun:test";

const { initRevenuecatCli } = await import(
	"../../../src/external/revenueCat/misc/initRevenuecatCli.js"
);

const mockFetch = mock(() =>
	Promise.resolve(
		new Response(
			JSON.stringify({
				object: "project",
				id: "proj_123",
				name: "Test Project",
				created_at: Date.now(),
			}),
			{
				status: 201,
				headers: { "Content-Type": "application/json" },
			},
		),
	),
);

// Injected transport — the unit never touches global fetch.
const fetchImpl = mockFetch as unknown as typeof fetch;

describe("initRevenuecatCli.createProject", () => {
	beforeEach(() => {
		mockFetch.mockClear();
	});

	test("POSTs /v2/projects with {name}", async () => {
		const cli = initRevenuecatCli({ accessToken: "test-token", fetchImpl });
		const result = await cli.createProject({ name: "My Project" });

		expect(mockFetch).toHaveBeenCalledTimes(1);
		const [url, init] = mockFetch.mock.calls[0] as unknown as [
			string,
			RequestInit,
		];
		expect(url.toString()).toBe("https://api.revenuecat.com/v2/projects");
		expect(init.method).toBe("POST");
		expect(JSON.parse(init.body as string)).toEqual({ name: "My Project" });
		expect(result).toEqual({
			object: "project",
			id: "proj_123",
			name: "Test Project",
			created_at: expect.any(Number),
		});
	});

	test("throws when API returns error", async () => {
		mockFetch.mockImplementationOnce(() =>
			Promise.resolve(
				new Response(JSON.stringify({ error: "invalid_name" }), {
					status: 422,
					headers: { "Content-Type": "application/json" },
				}),
			),
		);

		const cli = initRevenuecatCli({ accessToken: "test-token", fetchImpl });
		await expect(cli.createProject({ name: "bad" })).rejects.toThrow();
	});
});

const jsonResponse = (body: unknown, status = 200) =>
	Promise.resolve(
		new Response(JSON.stringify(body), {
			status,
			headers: { "Content-Type": "application/json" },
		}),
	);

describe("initRevenuecatCli.listProductPrices", () => {
	beforeEach(() => mockFetch.mockClear());

	test("parses RC's bare price array", async () => {
		mockFetch.mockImplementationOnce(() =>
			jsonResponse([{ id: "prc1", amount_micros: 4_990_000, currency: "USD" }]),
		);
		const cli = initRevenuecatCli({
			projectId: "proj_x",
			accessToken: "t",
			fetchImpl,
		});
		const prices = await cli.listProductPrices("prod_1");

		const [url] = mockFetch.mock.calls[0] as unknown as [string];
		expect(url.toString()).toBe(
			"https://api.revenuecat.com/v2/projects/proj_x/products/prod_1/prices",
		);
		expect(prices).toEqual([
			{ id: "prc1", amount_micros: 4_990_000, currency: "USD" },
		]);
	});

	test("tolerates an { items } envelope", async () => {
		mockFetch.mockImplementationOnce(() =>
			jsonResponse({
				items: [{ id: "prc2", amount_micros: 1_000_000, currency: "EUR" }],
			}),
		);
		const cli = initRevenuecatCli({
			projectId: "proj_x",
			accessToken: "t",
			fetchImpl,
		});
		expect(await cli.listProductPrices("prod_2")).toEqual([
			{ id: "prc2", amount_micros: 1_000_000, currency: "EUR" },
		]);
	});
});

describe("initRevenuecatCli.listAllProducts", () => {
	beforeEach(() => mockFetch.mockClear());

	test("follows next_page and concatenates items", async () => {
		mockFetch
			.mockImplementationOnce(() =>
				jsonResponse({
					object: "list",
					items: [{ id: "p1", store_identifier: "a" }],
					next_page: "/v2/projects/proj_x/products?page=2",
				}),
			)
			.mockImplementationOnce(() =>
				jsonResponse({
					object: "list",
					items: [{ id: "p2", store_identifier: "b" }],
					next_page: null,
				}),
			);
		const cli = initRevenuecatCli({
			projectId: "proj_x",
			accessToken: "t",
			fetchImpl,
		});
		const products = await cli.listAllProducts();

		expect(mockFetch).toHaveBeenCalledTimes(2);
		expect(products.map((p) => p.id)).toEqual(["p1", "p2"]);
	});
});

describe("initRevenuecatCli webhook integrations", () => {
	beforeEach(() => mockFetch.mockClear());

	test("listWebhookIntegrations follows next_page", async () => {
		mockFetch
			.mockImplementationOnce(() =>
				jsonResponse({
					object: "list",
					items: [{ id: "wh1", url: "https://a/1" }],
					next_page: "/v2/projects/proj_x/integrations/webhooks?page=2",
				}),
			)
			.mockImplementationOnce(() =>
				jsonResponse({
					object: "list",
					items: [{ id: "wh2", url: "https://a/2" }],
					next_page: null,
				}),
			);
		const cli = initRevenuecatCli({
			projectId: "proj_x",
			accessToken: "t",
			fetchImpl,
		});
		const hooks = await cli.listWebhookIntegrations();

		expect(mockFetch).toHaveBeenCalledTimes(2);
		const [firstUrl] = mockFetch.mock.calls[0] as unknown as [string];
		expect(firstUrl.toString()).toBe(
			"https://api.revenuecat.com/v2/projects/proj_x/integrations/webhooks?limit=100",
		);
		expect(hooks.map((h) => h.id)).toEqual(["wh1", "wh2"]);
	});

	test("createWebhookIntegration POSTs the body", async () => {
		mockFetch.mockImplementationOnce(() =>
			jsonResponse({ object: "webhook_integration", id: "wh_new" }, 201),
		);
		const cli = initRevenuecatCli({
			projectId: "proj_x",
			accessToken: "t",
			fetchImpl,
		});
		const result = await cli.createWebhookIntegration({
			name: "Autumn (sandbox)",
			url: "https://ngrok.test/webhooks/revenuecat/org_1/sandbox",
			authorization_header: "whsec_abc",
			environment: "sandbox",
		});

		const [url, init] = mockFetch.mock.calls[0] as unknown as [
			string,
			RequestInit,
		];
		expect(url.toString()).toBe(
			"https://api.revenuecat.com/v2/projects/proj_x/integrations/webhooks",
		);
		expect(init.method).toBe("POST");
		expect(JSON.parse(init.body as string)).toMatchObject({
			authorization_header: "whsec_abc",
			environment: "sandbox",
		});
		expect(result.id).toBe("wh_new");
	});
});
