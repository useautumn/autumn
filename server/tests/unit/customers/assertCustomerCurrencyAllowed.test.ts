import { describe, expect, test } from "bun:test";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { assertCustomerCurrencyAllowed } from "@/internal/customers/cusUtils/initCustomer";

const ctxWithFlag = (enabled: boolean) =>
	({
		org: { default_currency: "usd", config: { multi_currency: enabled } },
	}) as unknown as AutumnContext;

describe("assertCustomerCurrencyAllowed", () => {
	test("allows a currency when the org flag is on", () => {
		expect(() =>
			assertCustomerCurrencyAllowed({
				ctx: ctxWithFlag(true),
				currency: "eur",
			}),
		).not.toThrow();
	});

	test("rejects a currency when the org flag is off", () => {
		expect(() =>
			assertCustomerCurrencyAllowed({
				ctx: ctxWithFlag(false),
				currency: "eur",
			}),
		).toThrow(/not enabled/i);
	});

	test("allows no currency regardless of the flag", () => {
		expect(() =>
			assertCustomerCurrencyAllowed({
				ctx: ctxWithFlag(false),
				currency: null,
			}),
		).not.toThrow();
		expect(() =>
			assertCustomerCurrencyAllowed({
				ctx: ctxWithFlag(false),
				currency: undefined,
			}),
		).not.toThrow();
	});
});
