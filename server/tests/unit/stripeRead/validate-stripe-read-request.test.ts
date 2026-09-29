import { describe, expect, test } from "bun:test";
import { validateStripeReadRequest } from "@/internal/stripeRead/actions/stripeGet/validateStripeReadRequest.js";

const rejects = ({
	path,
	params,
}: {
	path: string;
	params?: Record<string, unknown>;
}) => expect(() => validateStripeReadRequest({ path, params })).toThrow();

describe("validateStripeReadRequest", () => {
	test("accepts v1 and v2 resource paths", () => {
		expect(() =>
			validateStripeReadRequest({ path: "/v1/subscriptions" }),
		).not.toThrow();
		expect(() =>
			validateStripeReadRequest({
				path: "/v2/billing/meter_events",
				params: { expand: ["data.customer"] },
			}),
		).not.toThrow();
	});

	test("rejects malformed paths", () => {
		for (const path of [
			"v1/customers",
			"/v3/customers",
			"https://api.stripe.com/v1/customers",
			"//files.stripe.com/v1/files",
			"/v1/customers/../accounts",
			"/v1/customers?limit=1",
			"/v1/customers#frag",
		]) {
			rejects({ path });
		}
	});

	test("rejects blacklisted endpoints", () => {
		for (const path of [
			"/v1/apps/secrets",
			"/v1/apps/secrets/find",
			"/v1/accounts",
			"/v1/accounts/acct_123",
			"/v1/accounts/acct_123/external_accounts",
			"/v1/application_fees",
			"/v1/application_fees/fee_123/refunds",
			"/v1/transfers",
			"/v1/transfers/tr_123",
			"/v1/files/file_123/contents",
			"/v1/quotes/qt_123/pdf",
			"/V1/Accounts",
		]) {
			rejects({ path });
		}
	});

	test("allows non-blacklisted look-alikes", () => {
		for (const path of [
			"/v1/account",
			"/v1/files/file_123",
			"/v1/quotes/qt_1",
		]) {
			expect(() => validateStripeReadRequest({ path })).not.toThrow();
		}
	});

	test("rejects expand values with a number or cvc segment", () => {
		rejects({
			path: "/v1/payment_methods/pm_1",
			params: { expand: ["card.number"] },
		});
		rejects({ path: "/v1/customers", params: { expand: "data.number" } });
		rejects({ path: "/v1/customers", params: { expand: ["card.cvc"] } });
		rejects({
			path: "/v1/customers",
			params: { "expand[]": ["data.card.number"] },
		});
	});

	test("allows expand values that only contain number or cvc", () => {
		for (const expand of [
			"data.sources.cvc_check",
			"data.payment_method.card.checks",
			"data.invoice_number",
		]) {
			expect(() =>
				validateStripeReadRequest({
					path: "/v1/customers",
					params: { expand: [expand] },
				}),
			).not.toThrow();
		}
	});
});
