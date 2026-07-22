/**
 * Regression coverage for the distinction between a catalog item marked
 * `pooled` and a managed pooled-balance row.
 *
 * Red failure mode: there is no canonical server classifier, so lifecycle
 * callers independently treat every `pooled` catalog item as managed.
 * Green success criteria: only entity-attached pooled sources and synthetic
 * pooled balances are classified as managed.
 */
import { describe, expect, test } from "bun:test";
import { customerEntitlements } from "@tests/utils/fixtures/db/customerEntitlements.js";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts.js";
import {
	customerProductHasPooledSource,
	isManagedPooledCustomerEntitlement,
	isPooledSourceCustomerEntitlement,
	isSyntheticPooledBalanceCustomerEntitlement,
} from "@/internal/billing/v2/pooledBalances/utils/pooledCustomerEntitlementClassification.js";

const createCustomerProduct = ({
	id,
	pooled,
	entityAttached,
}: {
	id: string;
	pooled: boolean;
	entityAttached: boolean;
}) => {
	const customerEntitlement = customerEntitlements.create({
		id: `customer-entitlement-${id}`,
		entitlementId: `entitlement-${id}`,
		featureId: "messages",
		featureName: "Messages",
		allowance: 500,
		balance: 500,
		customerProductId: id,
	});
	customerEntitlement.entitlement = {
		...customerEntitlement.entitlement,
		pooled,
	};

	return customerProducts.create({
		id,
		customerEntitlements: [customerEntitlement],
		internalEntityId: entityAttached ? `internal-entity-${id}` : undefined,
		entityId: entityAttached ? `entity-${id}` : undefined,
	});
};

describe("pooled customer-entitlement classification", () => {
	const pooledEntityProduct = createCustomerProduct({
		id: "pooled-entity-product",
		pooled: true,
		entityAttached: true,
	});
	const pooledCustomerProduct = createCustomerProduct({
		id: "pooled-customer-product",
		pooled: true,
		entityAttached: false,
	});
	const nonPooledEntityProduct = createCustomerProduct({
		id: "non-pooled-entity-product",
		pooled: false,
		entityAttached: true,
	});
	const syntheticPooledBalance = customerEntitlements.create({
		id: "synthetic-pooled-balance",
		entitlementId: "synthetic-pooled-entitlement",
		featureId: "messages",
		featureName: "Messages",
		allowance: 0,
		balance: 0,
	});
	syntheticPooledBalance.customer_product_id = null;
	syntheticPooledBalance.entitlement = {
		...syntheticPooledBalance.entitlement,
		pooled: true,
	};

	test("identifies only entity-attached pooled product rows as sources", () => {
		expect(
			isPooledSourceCustomerEntitlement({
				customerEntitlement: pooledEntityProduct.customer_entitlements[0]!,
				customerProduct: pooledEntityProduct,
			}),
		).toBe(true);
		expect(
			isPooledSourceCustomerEntitlement({
				customerEntitlement: pooledCustomerProduct.customer_entitlements[0]!,
				customerProduct: pooledCustomerProduct,
			}),
		).toBe(false);
		expect(
			isPooledSourceCustomerEntitlement({
				customerEntitlement: nonPooledEntityProduct.customer_entitlements[0]!,
				customerProduct: nonPooledEntityProduct,
			}),
		).toBe(false);
		expect(
			isPooledSourceCustomerEntitlement({
				customerEntitlement: syntheticPooledBalance,
				customerProduct: null,
			}),
		).toBe(false);
	});

	test("identifies only a loose pooled row as a synthetic balance", () => {
		expect(
			isSyntheticPooledBalanceCustomerEntitlement({
				customerEntitlement: syntheticPooledBalance,
				customerProduct: null,
			}),
		).toBe(true);
		expect(
			isSyntheticPooledBalanceCustomerEntitlement({
				customerEntitlement: pooledEntityProduct.customer_entitlements[0]!,
				customerProduct: pooledEntityProduct,
			}),
		).toBe(false);
		expect(
			isSyntheticPooledBalanceCustomerEntitlement({
				customerEntitlement: pooledCustomerProduct.customer_entitlements[0]!,
				customerProduct: pooledCustomerProduct,
			}),
		).toBe(false);
	});

	test("managed classification is the union of source and synthetic rows", () => {
		expect(
			isManagedPooledCustomerEntitlement({
				customerEntitlement: pooledEntityProduct.customer_entitlements[0]!,
				customerProduct: pooledEntityProduct,
			}),
		).toBe(true);
		expect(
			isManagedPooledCustomerEntitlement({
				customerEntitlement: syntheticPooledBalance,
				customerProduct: null,
			}),
		).toBe(true);
		expect(
			isManagedPooledCustomerEntitlement({
				customerEntitlement: pooledCustomerProduct.customer_entitlements[0]!,
				customerProduct: pooledCustomerProduct,
			}),
		).toBe(false);
	});

	test("identifies products that contribute a managed pooled source", () => {
		expect(
			customerProductHasPooledSource({
				customerProduct: pooledEntityProduct,
			}),
		).toBe(true);
		expect(
			customerProductHasPooledSource({
				customerProduct: pooledCustomerProduct,
			}),
		).toBe(false);
		expect(
			customerProductHasPooledSource({
				customerProduct: nonPooledEntityProduct,
			}),
		).toBe(false);
	});
});
