import { expect, test } from "bun:test";
import type { FullCusProduct } from "@autumn/shared";
import { customerProductsToMainPlanName } from "@autumn/shared";
import { subscriptionRenewalPhrase } from "@/views/customers2/components/sheets/set-plans-subscription/utils/subscriptionRenewal";

const plan = ({ name, isAddOn }: { name: string; isAddOn: boolean }) =>
	({
		product_id: name,
		product: { name, is_add_on: isAddOn },
	}) as FullCusProduct;

test("a subscription is named after its main plan, or its first add-on when it has none", () => {
	expect([
		customerProductsToMainPlanName({
			customerProducts: [
				plan({ name: "Credits", isAddOn: true }),
				plan({ name: "Pro", isAddOn: false }),
			],
		}),
		customerProductsToMainPlanName({
			customerProducts: [plan({ name: "Seats", isAddOn: true })],
		}),
		customerProductsToMainPlanName({ customerProducts: [] }),
	]).toEqual(["Pro", "Seats", null]);
});

test("the renewal reads mid-sentence", () => {
	const date = new Date(2026, 10, 1).getTime();
	expect([
		subscriptionRenewalPhrase({ renewal: { kind: "renews", date } }),
		subscriptionRenewalPhrase({ renewal: { kind: "cancels", date } }),
		subscriptionRenewalPhrase({ renewal: { kind: "payment_failed", date } }),
		subscriptionRenewalPhrase({ renewal: { kind: "none" } }),
	]).toEqual([
		"renews Nov 1, 2026",
		"cancels Nov 1, 2026",
		"payment failed Nov 1, 2026",
		null,
	]);
});
