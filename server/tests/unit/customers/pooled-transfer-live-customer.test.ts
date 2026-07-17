import { expect, test } from "bun:test";
import type {
	FullCusProduct,
	FullCustomer,
	FullCustomerEntitlement,
	FullSubject,
} from "@autumn/shared";
import { mergePooledTransferCustomer } from "@/internal/customers/handlers/handleTransferProduct/mergePooledTransferCustomer.js";

test("pooled transfer merges scoped live products without dropping siblings", () => {
	const sourceLegacy = { id: "source", quantity: 1 } as FullCusProduct;
	const sourceLive = { id: "source", quantity: 2 } as FullCusProduct;
	const sibling = { id: "sibling", quantity: 3 } as FullCusProduct;
	const liveExtra = { id: "live-pool" } as FullCustomerEntitlement;
	const fullCustomer = {
		customer_products: [sourceLegacy, sibling],
		extra_customer_entitlements: [{ id: "legacy-pool" }],
	} as FullCustomer;
	const fullSubject = {
		customer_products: [sourceLive],
		extra_customer_entitlements: [liveExtra],
	} as FullSubject;

	const merged = mergePooledTransferCustomer({ fullCustomer, fullSubject });

	expect(merged.customer_products).toEqual([sourceLive, sibling]);
	expect(merged.extra_customer_entitlements).toEqual([liveExtra]);
});
