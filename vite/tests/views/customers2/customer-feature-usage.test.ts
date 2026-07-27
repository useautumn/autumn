import { describe, expect, test } from "bun:test";
import {
	CusProductStatus,
	type FullCusEntWithFullCusProduct,
	type FullCustomerEntitlement,
} from "@autumn/shared";
import { filterCustomerFeatureUsage } from "@/views/customers2/components/table/customer-feature-usage/customerFeatureUsageTableFilters";
import { flattenStandaloneCustomerEntitlements } from "@/views/customers2/components/table/customer-feature-usage/customerFeatureUsageUtils";

const buildCustomerEntitlement = ({
	id,
	pooled,
	isPooledBalance = false,
}: {
	id: string;
	pooled: boolean;
	isPooledBalance?: boolean;
}) =>
	({
		id,
		created_at: 0,
		is_pooled_balance: isPooledBalance,
		entitlement: {
			pooled,
			feature: { id: "messages" },
		},
		customer_product: {
			status: CusProductStatus.Active,
		},
	}) as FullCusEntWithFullCusProduct;

describe("customer feature usage pooled balances", () => {
	test("shows the synthetic pool and hides its contribution sources", () => {
		const ordinary = buildCustomerEntitlement({
			id: "ordinary",
			pooled: false,
		});
		const contributionSource = buildCustomerEntitlement({
			id: "source",
			pooled: true,
		});
		const syntheticPool = buildCustomerEntitlement({
			id: "pool",
			pooled: true,
			isPooledBalance: true,
		});

		const filtered = filterCustomerFeatureUsage({
			entitlements: [ordinary, contributionSource, syntheticPool],
			showExpired: false,
		});

		expect(filtered.map(({ id }) => id)).toEqual(["ordinary", "pool"]);
	});

	test("flattens hydrated pooled entitlements as standalone balances", () => {
		const pooledCustomerEntitlement = buildCustomerEntitlement({
			id: "pool",
			pooled: true,
			isPooledBalance: true,
		});

		const [flattened] = flattenStandaloneCustomerEntitlements({
			customerEntitlements: [
				pooledCustomerEntitlement as FullCustomerEntitlement,
			],
		});

		expect(flattened.id).toBe("pool");
		expect(flattened.is_pooled_balance).toBe(true);
		expect(flattened.customer_product).toBeNull();
	});
});
