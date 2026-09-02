import { expect, test } from "bun:test";
import type { FullCustomer, ProductV2 } from "@autumn/shared";
import { cusProductToPlan } from "@/views/customers2/components/sheets/CreateScheduleSheet";

test("hydrates the customer product's exact plan version", () => {
	const plan = cusProductToPlan({
		cusProduct: {
			customer_entitlements: [],
			customer_prices: [],
			entity_id: null,
			is_custom: false,
			options: [],
			product: { version: 2 },
			product_id: "generation",
		} as FullCustomer["customer_products"][number],
		products: [{ id: "generation", items: [], version: 3 } as ProductV2],
	});

	expect(plan.version).toBe(2);
});
