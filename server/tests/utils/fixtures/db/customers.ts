import type { FullCusProduct, FullCustomer } from "@autumn/shared";
import { AppEnv } from "@autumn/shared";

/**
 * Create a full customer fixture
 */
const create = ({
	customerProducts = [],
}: {
	customerProducts?: FullCusProduct[];
}): FullCustomer => ({
	id: "cus_test",
	name: "Test Customer",
	email: "test@example.com",
	fingerprint: null,
	internal_id: "cus_internal_test",
	org_id: "org_test",
	created_at: Date.now(),
	env: AppEnv.Sandbox,
	processor: { type: "stripe", id: "cus_stripe_test" },
	processors: null,
	metadata: {},
	customer_products: customerProducts,
	entities: [],
	extra_customer_entitlements: [],
});

// ═══════════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════════

export const customers = {
	create,
} as const;
