import { describe, expect, it } from "bun:test";
import { nextPaymentMethodTypes } from "./nextPaymentMethodTypes";

const original = ["card", "us_bank_account"] as const;

describe("nextPaymentMethodTypes", () => {
	it("unticking the last method cycles back to the prefilled methods", () => {
		const onlyCard = nextPaymentMethodTypes({
			selected: [...original],
			type: "us_bank_account",
			checked: false,
			original: [...original],
		});
		expect(onlyCard).toEqual(["card"]);
		expect(
			nextPaymentMethodTypes({
				selected: onlyCard ?? [],
				type: "card",
				checked: false,
				original: [...original],
			}),
		).toEqual(["card", "us_bank_account"]);
	});

	it("returns null, never an empty list, when nothing was prefilled", () => {
		for (const prefilled of [null, []]) {
			expect(
				nextPaymentMethodTypes({
					selected: ["card"],
					type: "card",
					checked: false,
					original: prefilled,
				}),
			).toBeNull();
		}
	});

	it("adds types in menu order", () => {
		expect(
			nextPaymentMethodTypes({
				selected: ["us_bank_account"],
				type: "card",
				checked: true,
				original: null,
			}),
		).toEqual(["card", "us_bank_account"]);
	});
});
