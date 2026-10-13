import { describe, expect, it } from "bun:test";
import {
	DEFAULT_PAYMENT_METHODS,
	nextPaymentMethodTypes,
} from "./nextPaymentMethodTypes";

describe("nextPaymentMethodTypes", () => {
	it("choosing Default methods resets the selection to null", () => {
		expect(
			nextPaymentMethodTypes({
				selected: ["card"],
				choice: DEFAULT_PAYMENT_METHODS,
				checked: true,
			}),
		).toBeNull();
	});

	it("never returns an empty list when the last type is unticked", () => {
		expect(
			nextPaymentMethodTypes({
				selected: ["card"],
				choice: "card",
				checked: false,
			}),
		).toBeUndefined();
	});

	it("adds and removes types in menu order", () => {
		expect(
			nextPaymentMethodTypes({
				selected: ["us_bank_account"],
				choice: "card",
				checked: true,
			}),
		).toEqual(["card", "us_bank_account"]);
		expect(
			nextPaymentMethodTypes({
				selected: ["card", "us_bank_account"],
				choice: "card",
				checked: false,
			}),
		).toEqual(["us_bank_account"]);
	});
});
