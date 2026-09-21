import { describe, expect, it } from "bun:test";
import type { VerifyResponse } from "@autumn/shared";
import type Stripe from "stripe";
import { createBillingVerifyExportStringifier } from "@/internal/customers/exports/csv/createBillingVerifyExportStringifier.js";
import { sweepStripeSubscriptions } from "@/internal/customers/exports/verify/sweepStripeSubscriptions.js";
import {
	isVerifyResponseClean,
	verifyResponseToExportRows,
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

describe("verifyResponseToExportRows", () => {
	it("yields no rows for a verified customer", () => {
		expect(isVerifyResponseClean({ response: cleanResponse })).toBe(true);
		expect(
			verifyResponseToExportRows({ customer, response: cleanResponse }),
		).toEqual([]);
	});

	it("yields one row per mismatch, customer-level rows without a subscription", () => {
		expect(isVerifyResponseClean({ response: mismatchedResponse })).toBe(false);
		expect(
			verifyResponseToExportRows({ customer, response: mismatchedResponse }),
		).toEqual([
			{
				...customer,
				stripe_subscription_id: null,
				severity: "warning",
				type: "shared_stripe_customer",
				message: "Shared Stripe customer",
			},
			{
				...customer,
				stripe_subscription_id: "sub_2",
				severity: "error",
				type: "stale_subscription_link",
				message: "Stale link",
			},
		]);
	});

	it("serializes rows under the fixed headers", async () => {
		const stringifier = createBillingVerifyExportStringifier();
		for (const row of verifyResponseToExportRows({
			customer,
			response: mismatchedResponse,
		})) {
			stringifier.write(row);
		}
		stringifier.end();

		let csv = "";
		for await (const chunk of stringifier) csv += chunk;
		const lines = csv.replace("﻿", "").trim().split("\r\n");

		expect(lines[0]).toBe(
			"Customer ID,Name,Email,Stripe Customer ID,Stripe Subscription ID,Severity,Issue,Details",
		);
		expect(lines[2]).toBe(
			"cus_1,Jane,jane@example.com,cus_stripe_1,sub_2,error,stale_subscription_link,Stale link",
		);
	});
});

describe("sweepStripeSubscriptions", () => {
	it("groups the org's subscriptions by Stripe customer", async () => {
		const listed = [
			{ id: "sub_1", customer: "cus_a" },
			{ id: "sub_2", customer: { id: "cus_b" } },
			{ id: "sub_3", customer: "cus_a" },
		] as Stripe.Subscription[];
		const stripeCli = {
			subscriptions: {
				list: () => ({
					async *[Symbol.asyncIterator]() {
						yield* listed;
					},
				}),
			},
		} as unknown as Stripe;

		const swept = await sweepStripeSubscriptions({ stripeCli });

		expect(swept.get("cus_a")?.map((sub) => sub.id)).toEqual([
			"sub_1",
			"sub_3",
		]);
		expect(swept.get("cus_b")?.map((sub) => sub.id)).toEqual(["sub_2"]);
	});
});
