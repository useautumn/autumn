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
	status = CusProductStatus.Active,
}: {
	id: string;
	pooled: boolean;
	isPooledBalance?: boolean;
	status?: CusProductStatus;
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
			status,
		},
	}) as FullCusEntWithFullCusProduct;

describe("customer feature usage pooled balances", () => {
	test("shows consumed standalone balances in the expired view", () => {
		const consumed = {
			...buildCustomerEntitlement({ id: "consumed", pooled: false }),
			balance: 0,
			unlimited: false,
			next_reset_at: null,
			customer_product: null,
		};

		const filtered = filterCustomerFeatureUsage({
			entitlements: [consumed],
			statuses: ["expired"],
		});

		expect(filtered.map(({ id }) => id)).toEqual(["consumed"]);
	});

	test("keeps consumed resetting balances out of the expired view", () => {
		const resetting = {
			...buildCustomerEntitlement({ id: "resetting", pooled: false }),
			balance: 0,
			unlimited: false,
			next_reset_at: Date.now() + 1000,
			customer_product: null,
		};

		const filtered = filterCustomerFeatureUsage({
			entitlements: [resetting],
			statuses: ["expired"],
		});

		expect(filtered).toEqual([]);
	});

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
			statuses: ["active"],
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

describe("customer feature usage product statuses", () => {
	test("hides pending entitlements from the active balance view", () => {
		const pending = buildCustomerEntitlement({
			id: "pending",
			pooled: false,
			status: CusProductStatus.Pending,
		});

		const filtered = filterCustomerFeatureUsage({
			entitlements: [pending],
			statuses: ["active"],
		});

		expect(filtered).toEqual([]);
	});

	test("hides pending entitlements from the expired balance view", () => {
		const pending = buildCustomerEntitlement({
			id: "pending",
			pooled: false,
			status: CusProductStatus.Pending,
		});

		const filtered = filterCustomerFeatureUsage({
			entitlements: [pending],
			statuses: ["expired"],
		});

		expect(filtered).toEqual([]);
	});

	test("keeps the active grant when the same feature also has a pending grant", () => {
		const active = buildCustomerEntitlement({
			id: "active",
			pooled: false,
			status: CusProductStatus.Active,
		});
		const pending = buildCustomerEntitlement({
			id: "pending",
			pooled: false,
			status: CusProductStatus.Pending,
		});

		const filtered = filterCustomerFeatureUsage({
			entitlements: [active, pending],
			statuses: ["active"],
		});

		expect(filtered.map(({ id }) => id)).toEqual(["active"]);
	});

	test("hides scheduled entitlements from the active balance view", () => {
		const scheduled = buildCustomerEntitlement({
			id: "scheduled",
			pooled: false,
			status: CusProductStatus.Scheduled,
		});

		const filtered = filterCustomerFeatureUsage({
			entitlements: [scheduled],
			statuses: ["active"],
		});

		expect(filtered).toEqual([]);
	});
});
