import { expect, test } from "bun:test";
import { previewMoneyFactsDrifted } from "../../../src/internal/approvals/utils/previewMoneyFacts.js";

const openInvoice = {
	id: "inv_123",
	customer_id: "cus_1",
	stripe_id: "in_123",
	status: "open",
	total: 50,
	amount_paid: 0,
	currency: "usd",
	items: [{ id: "li_1", description: "Setup fee", amount: 50 }],
};

test("an unchanged invoice has not drifted", () => {
	expect(
		previewMoneyFactsDrifted({
			current: { ...openInvoice },
			stored: openInvoice,
		}),
	).toEqual({ drifted: false });
});

test("a partial payment since the card was shown is drift", () => {
	expect(
		previewMoneyFactsDrifted({
			current: { ...openInvoice, amount_paid: 20 },
			stored: openInvoice,
		}),
	).toEqual({ drifted: true, reason: "amount paid 0 → 20" });
});

test("a status change since the card was shown is drift", () => {
	expect(
		previewMoneyFactsDrifted({
			current: { ...openInvoice, status: "paid", amount_paid: 50 },
			stored: openInvoice,
		}),
	).toEqual({ drifted: true, reason: "invoice status open → paid" });
});
