import { describe, expect, it } from "bun:test";
import type { VerifyResponse } from "@autumn/shared";
import type Stripe from "stripe";
import { createBillingVerifyExportStringifier } from "@/internal/customers/exports/csv/createBillingVerifyExportStringifier.js";
import { createBillingVerifyStripeReader } from "@/internal/customers/exports/verify/createBillingVerifyStripeReader.js";
import { stripeCreatedWindows } from "@/internal/customers/exports/verify/stripeCreatedWindows.js";
import { sweepStripeSubscriptions } from "@/internal/customers/exports/verify/sweepStripeSubscriptions.js";
import {
	isVerifyResponseClean,
	verifyResponseToExportRow,
} from "@/internal/customers/exports/verify/verifyResponseToExportRows.js";

const customer = {
	customer_id: "cus_1",
	name: "Jane",
	email: "jane@example.com",
	stripe_customer_id: "cus_stripe_1",
};

const cleanResponse: VerifyResponse = {
	customer_id: "cus_1",
	customer_mismatches: [],
	subscriptions: [
		{ stripe_subscription_id: "sub_1", status: "correct", mismatches: [] },
	],
};

const mismatchedResponse: VerifyResponse = {
	customer_id: "cus_1",
	customer_mismatches: [
		{
			type: "shared_stripe_customer",
			stripe_customer_id: "cus_stripe_1",
			other_customer_ids: ["cus_2"],
			other_customers: [{ id: "cus_2", name: null, email: null }],
			severity: "warning",
			message: "Shared Stripe customer",
		},
	],
	subscriptions: [
		{ stripe_subscription_id: "sub_1", status: "correct", mismatches: [] },
		{
			stripe_subscription_id: "sub_2",
			status: "mismatched",
			mismatches: [
				{
					type: "stale_subscription_link",
					severity: "error",
					message: "Stale link",
				},
			],
		},
	],
};

const expectedRow = {
	...customer,
	stripe_subscription_ids: "sub_2",
	severity: "error",
	issues: "shared_stripe_customer, stale_subscription_link",
	details:
		"shared_stripe_customer: Shared Stripe customer, stale_subscription_link: Stale link",
};

describe("verifyResponseToExportRow", () => {
	it("yields no row for a verified customer", () => {
		expect(isVerifyResponseClean({ response: cleanResponse })).toBe(true);
		expect(
			verifyResponseToExportRow({ customer, response: cleanResponse }),
		).toBeNull();
	});

	it("folds every mismatch into one row, listing only mismatched subscriptions", () => {
		expect(isVerifyResponseClean({ response: mismatchedResponse })).toBe(false);
		expect(
			verifyResponseToExportRow({ customer, response: mismatchedResponse }),
		).toEqual(expectedRow);
	});

	it("is a warning only when every mismatch is one", () => {
		const row = verifyResponseToExportRow({
			customer,
			response: { ...mismatchedResponse, subscriptions: [] },
		});
		expect(row?.severity).toBe("warning");
		expect(row?.stripe_subscription_ids).toBeNull();
	});

	it("serializes the row under the fixed headers", async () => {
		const stringifier = createBillingVerifyExportStringifier();
		stringifier.write(expectedRow);
		stringifier.end();

		let csv = "";
		for await (const chunk of stringifier) csv += chunk;
		const lines = csv.replace("\uFEFF", "").trim().split("\r\n");

		expect(lines[0]).toBe(
			"Customer ID,Name,Email,Stripe Customer ID,Stripe Subscription IDs,Severity,Issues,Details",
		);
		expect(lines[1]).toBe(
			'cus_1,Jane,jane@example.com,cus_stripe_1,sub_2,error,"shared_stripe_customer, stale_subscription_link","shared_stripe_customer: Shared Stripe customer, stale_subscription_link: Stale link"',
		);
	});
});

const page = <Item>(data: Item[]) => Promise.resolve({ data, has_more: false });

const DAY_MS = 24 * 60 * 60 * 1000;

describe("sweepStripeSubscriptions", () => {
	const buildStripeCli = () => {
		const listed: { created?: Stripe.RangeQueryParam; test_clock?: string }[] =
			[];
		const stripeCli = {
			subscriptions: {
				list: ({
					created,
					test_clock,
				}: {
					created?: Stripe.RangeQueryParam;
					test_clock?: string;
				}) => {
					listed.push({ created, test_clock });
					if (test_clock) {
						return page([{ id: `sub_${test_clock}`, customer: "cus_clock" }]);
					}
					// The open-ended first window holds everything in this fake org.
					return page(
						created && "gte" in created
							? []
							: [
									{ id: "sub_1", customer: "cus_a" },
									{ id: "sub_2", customer: { id: "cus_b" } },
									{ id: "sub_3", customer: "cus_a" },
								],
					);
				},
			},
			testHelpers: {
				testClocks: { list: () => page([{ id: "clock_1" }]) },
			},
		} as unknown as Stripe;
		return { listed, stripeCli };
	};
	const now = Date.now();

	it("groups the org's subscriptions by Stripe customer and reports each page", async () => {
		const { listed, stripeCli } = buildStripeCli();
		const pageCounts: number[] = [];

		const swept = await sweepStripeSubscriptions({
			stripeCli,
			includeTestClocks: false,
			sinceMs: now - 10 * DAY_MS,
			untilMs: now,
			limits: { windowDays: 30 },
			onPage: (count) => {
				pageCounts.push(count);
			},
		});

		expect(swept.get("cus_a")?.map((sub) => sub.id)).toEqual([
			"sub_1",
			"sub_3",
		]);
		expect(swept.get("cus_b")?.map((sub) => sub.id)).toEqual(["sub_2"]);
		expect(listed.every((call) => call.test_clock === undefined)).toBe(true);
		expect(pageCounts.sort()).toEqual([0, 3]);
	});

	it("also sweeps each test clock, which the org-wide listing omits", async () => {
		const { stripeCli } = buildStripeCli();

		const swept = await sweepStripeSubscriptions({
			stripeCli,
			includeTestClocks: true,
			sinceMs: now - 10 * DAY_MS,
			untilMs: now,
		});

		expect(swept.get("cus_clock")?.map((sub) => sub.id)).toEqual([
			"sub_clock_1",
		]);
		expect(swept.get("cus_a")?.length).toBe(2);
	});
});

describe("stripeCreatedWindows", () => {
	it("covers all time with disjoint windows that meet at their boundaries", () => {
		const sinceMs = Date.UTC(2026, 0, 15);
		const windows = stripeCreatedWindows({
			sinceMs,
			untilMs: Date.UTC(2026, 2, 1),
			windowDays: 7,
		});

		expect(windows[0]).toEqual({ lt: Math.floor(sinceMs / 1000) });
		expect(windows[windows.length - 1]).toEqual({
			gte: windows[windows.length - 2]?.lt,
		});
		for (let i = 1; i < windows.length; i++) {
			expect(windows[i].gte).toBe(windows[i - 1].lt);
		}
		expect(windows.length).toBe(8);
	});

	it("slices a heavy recent range finer than a monthly window would", () => {
		const range = {
			sinceMs: Date.UTC(2026, 0, 1),
			untilMs: Date.UTC(2026, 2, 1),
		};

		expect(
			stripeCreatedWindows({ ...range, windowDays: 7 }).length,
		).toBeGreaterThan(
			stripeCreatedWindows({ ...range, windowDays: 30 }).length,
		);
	});

	it("degrades to one unbounded window when there is no history", () => {
		const now = Date.now();
		expect(stripeCreatedWindows({ sinceMs: now, untilMs: now })).toEqual([{}]);
	});
});

describe("createBillingVerifyStripeReader", () => {
	const buildStripeCli = () => {
		const calls = { prices: 0, schedules: 0, subscriptions: 0 };
		const stripeCli = {
			prices: {
				retrieve: async (id: string) => {
					calls.prices++;
					return { id };
				},
			},
			subscriptionSchedules: {
				retrieve: async (id: string) => {
					calls.schedules++;
					return { id, source: "live" };
				},
			},
			subscriptions: {
				retrieve: async (id: string) => {
					calls.subscriptions++;
					return { id };
				},
			},
		} as unknown as Stripe;
		return { calls, stripeCli };
	};

	it("reads each price once for the whole run", async () => {
		const { calls, stripeCli } = buildStripeCli();
		const reader = createBillingVerifyStripeReader({ stripeCli });

		await Promise.all([
			reader.prices.retrieve("price_1", { expand: ["tiers"] }),
			reader.prices.retrieve("price_1", { expand: ["tiers"] }),
		]);
		await reader.prices.retrieve("price_1", { expand: ["tiers"] });

		expect(calls.prices).toBe(1);
	});

	it("reads each schedule once, expanded, however verify asks for it", async () => {
		const { calls, stripeCli } = buildStripeCli();
		const reader = createBillingVerifyStripeReader({ stripeCli });

		await reader.subscriptionSchedules.retrieve("sched_1");
		await reader.subscriptionSchedules.retrieve("sched_1", {
			expand: ["phases.items.price"],
		});

		expect(calls.schedules).toBe(1);
	});

	it("leaves every other resource live", async () => {
		const { calls, stripeCli } = buildStripeCli();
		const reader = createBillingVerifyStripeReader({ stripeCli });

		await reader.subscriptions.retrieve("sub_1");
		await reader.subscriptions.retrieve("sub_1");

		expect(calls.subscriptions).toBe(2);
	});

	it("does not cache a failed read", async () => {
		let attempts = 0;
		const stripeCli = {
			prices: {
				retrieve: async (id: string) => {
					attempts++;
					if (attempts === 1) throw new Error("rate limited");
					return { id };
				},
			},
			subscriptionSchedules: {},
		} as unknown as Stripe;
		const reader = createBillingVerifyStripeReader({ stripeCli });

		await expect(reader.prices.retrieve("price_1")).rejects.toThrow();
		expect((await reader.prices.retrieve("price_1")).id).toBe("price_1");
	});
});
