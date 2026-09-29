import { describe, expect, mock, test } from "bun:test";
import { AppEnv, type Organization } from "@autumn/shared";
import type Stripe from "stripe";
import { redactStripeResponse } from "@/internal/stripeRead/actions/stripeGet/redactStripeResponse.js";
import { resolveStripeReadClient } from "@/internal/stripeRead/actions/stripeGet/resolveStripeReadClient.js";
import { stripeGet } from "@/internal/stripeRead/actions/stripeGet/stripeGet.js";
import type { StripeReadClient } from "@/internal/stripeRead/types/stripeReadClient.js";

type RawCall = [
	string,
	string,
	unknown,
	{ stripeAccount?: string } | undefined,
];

const fakeClient = ({
	responses,
	stripeAccount,
	platformKeyed = false,
}: {
	responses: unknown[];
	stripeAccount?: string;
	platformKeyed?: boolean;
}) => {
	const rawRequest = mock(async () => responses.shift());
	const client: StripeReadClient = {
		stripe: { rawRequest } as unknown as Pick<Stripe, "rawRequest">,
		stripeAccount,
		platformKeyed,
	};
	return { client, calls: () => rawRequest.mock.calls as unknown as RawCall[] };
};

const listPage = ({ ids, hasMore }: { ids: string[]; hasMore: boolean }) => ({
	object: "list",
	url: "/v1/customers",
	has_more: hasMore,
	data: ids.map((id) => ({ id, object: "customer" })),
});

describe("stripeGet", () => {
	test("issues a GET with params encoded in the query string", async () => {
		const { client, calls } = fakeClient({
			responses: [{ id: "sub_1", object: "subscription" }],
		});

		await stripeGet({
			client,
			path: "/v1/subscriptions/sub_1",
			params: { expand: ["customer", "latest_invoice"], metadata: { a: "b" } },
		});

		const [[method, path, params]] = calls();
		expect(method).toBe("GET");
		expect(params).toBeUndefined();
		expect(decodeURIComponent(path)).toBe(
			"/v1/subscriptions/sub_1?expand[0]=customer&expand[1]=latest_invoice&metadata[a]=b",
		);
	});

	test("rejects invalid paths before calling Stripe", async () => {
		const { client, calls } = fakeClient({ responses: [] });
		await expect(stripeGet({ client, path: "/v1/accounts" })).rejects.toThrow();
		expect(calls()).toHaveLength(0);
	});

	test("forces Stripe-Account on every request for platform-keyed clients", async () => {
		const { client, calls } = fakeClient({
			responses: [
				listPage({ ids: ["cus_1"], hasMore: true }),
				listPage({ ids: ["cus_2"], hasMore: false }),
			],
			stripeAccount: "acct_123",
			platformKeyed: true,
		});

		await stripeGet({ client, path: "/v1/customers", maxPages: 2 });

		expect(calls()).toHaveLength(2);
		for (const [, , , options] of calls()) {
			expect(options?.stripeAccount).toBe("acct_123");
		}
	});

	test("refuses a platform-keyed client without a Stripe account", async () => {
		const { client, calls } = fakeClient({
			responses: [],
			platformKeyed: true,
		});
		await expect(
			stripeGet({ client, path: "/v1/customers" }),
		).rejects.toThrow();
		expect(calls()).toHaveLength(0);
	});

	test("auto-paginates v1 lists via starting_after up to maxPages", async () => {
		const { client, calls } = fakeClient({
			responses: [
				listPage({ ids: ["cus_1", "cus_2"], hasMore: true }),
				listPage({ ids: ["cus_3"], hasMore: true }),
				listPage({ ids: ["cus_4"], hasMore: false }),
			],
		});

		const result = await stripeGet({
			client,
			path: "/v1/customers",
			params: { limit: 2 },
			maxPages: 2,
		});

		expect(result).toMatchObject({
			object: "list",
			has_more: true,
			data: [{ id: "cus_1" }, { id: "cus_2" }, { id: "cus_3" }],
		});
		expect(decodeURIComponent(calls()[1][1])).toBe(
			"/v1/customers?limit=2&starting_after=cus_2",
		);
	});

	test("defaults to one page and caps maxPages at 10", async () => {
		const pages = Array.from({ length: 12 }, (_, index) =>
			listPage({ ids: [`cus_${index}`], hasMore: true }),
		);
		const single = fakeClient({ responses: [...pages] });
		await stripeGet({ client: single.client, path: "/v1/customers" });
		expect(single.calls()).toHaveLength(1);

		const capped = fakeClient({ responses: [...pages] });
		await stripeGet({
			client: capped.client,
			path: "/v1/customers",
			maxPages: 50,
		});
		expect(capped.calls()).toHaveLength(10);
	});

	test("follows v2 next_page_url", async () => {
		const { client, calls } = fakeClient({
			responses: [
				{ data: [{ id: "a" }], next_page_url: "/v2/core/events?page=p2" },
				{ data: [{ id: "b" }], next_page_url: null },
			],
		});

		const result = await stripeGet({
			client,
			path: "/v2/core/events",
			maxPages: 3,
		});

		expect(result).toMatchObject({
			object: "list",
			has_more: false,
			data: [{ id: "a" }, { id: "b" }],
		});
		expect(calls()[1][1]).toBe("/v2/core/events?page=p2");
	});

	test("redacts secrets from the response", async () => {
		const { client } = fakeClient({
			responses: [
				{
					id: "cs_1",
					object: "checkout.session",
					url: "https://checkout.stripe.com/secret",
					client_secret: "cs_secret",
					payment_intent: { object: "payment_intent", client_secret: "pi_s" },
				},
			],
		});

		const result = await stripeGet({
			client,
			path: "/v1/checkout/sessions/cs_1",
		});

		expect(JSON.stringify(result)).not.toContain("secret");
		expect(result).toMatchObject({ id: "cs_1", payment_intent: {} });
	});

	test("truncates oversized responses with a marker", async () => {
		const big = listPage({
			ids: Array.from(
				{ length: 5000 },
				(_, index) => `cus_${"x".repeat(40)}${index}`,
			),
			hasMore: false,
		});
		const { client } = fakeClient({ responses: [big] });

		const result = await stripeGet({ client, path: "/v1/customers" });

		expect(JSON.stringify(result).length).toBeLessThanOrEqual(210_000);
		expect(result).toMatchObject({ truncated: true });
	});
});

describe("redactStripeResponse", () => {
	test("keeps url on non-checkout objects", () => {
		expect(
			redactStripeResponse({ body: { object: "invoice", url: "https://x" } }),
		).toEqual({ object: "invoice", url: "https://x" });
	});
});

describe("resolveStripeReadClient", () => {
	const createClient = mock(() => ({}) as Stripe);

	test("secret-key orgs use their own key with no account header", () => {
		const org = {
			stripe_config: { test_api_key: "encrypted" },
		} as unknown as Organization;

		expect(
			resolveStripeReadClient({ org, env: AppEnv.Sandbox, createClient }),
		).toMatchObject({ platformKeyed: false, stripeAccount: undefined });
	});

	test("OAuth orgs are platform-keyed and pinned to their account", () => {
		const org = {
			test_stripe_connect: { account_id: "acct_123" },
		} as unknown as Organization;

		expect(
			resolveStripeReadClient({ org, env: AppEnv.Sandbox, createClient }),
		).toMatchObject({ platformKeyed: true, stripeAccount: "acct_123" });
	});

	test("orgs without Stripe are rejected", () => {
		expect(() =>
			resolveStripeReadClient({
				org: {} as Organization,
				env: AppEnv.Sandbox,
				createClient,
			}),
		).toThrow();
	});
});

describe("stripeGet hardening", () => {
	test("rejects card PAN/CVC expands hidden inside nested params", async () => {
		for (const expand of [
			{ "0": "number" },
			{ nested: ["card.cvc"] },
			[["data.number"]],
		]) {
			const { client, calls } = fakeClient({ responses: [{}] });
			await expect(
				stripeGet({
					client,
					path: "/v1/issuing/cards/ic_1",
					params: { expand },
				}),
			).rejects.toThrow("not allowed");
			expect(calls()).toHaveLength(0);
		}
	});

	test("strips card number and cvc from issuing cards in any response", () => {
		expect(
			redactStripeResponse({
				body: {
					object: "list",
					data: [
						{
							object: "issuing.card",
							id: "ic_1",
							number: "4242",
							cvc: "123",
							last4: "4242",
						},
					],
				},
			}),
		).toEqual({
			object: "list",
			data: [{ object: "issuing.card", id: "ic_1", last4: "4242" }],
		});
	});

	test("a truncated search keeps its next_page cursor", async () => {
		const { client } = fakeClient({
			responses: [
				{
					object: "search_result",
					data: [{ id: "cus_1" }],
					has_more: true,
					next_page: "cursor_2",
				},
			],
		});
		expect(
			await stripeGet({
				client,
				path: "/v1/customers/search",
				params: { query: "email:'a'" },
			}),
		).toEqual({
			object: "search_result",
			data: [{ id: "cus_1" }],
			has_more: true,
			next_page: "cursor_2",
		});
	});
});
