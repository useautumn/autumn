import { describe, expect, test } from "bun:test";
import {
	CusProductStatus,
	EntInterval,
	FeatureType,
	PooledBalanceResetOwnerType,
	RolloverExpiryDurationType,
} from "@autumn/shared";
import { customerEntitlements } from "@tests/utils/fixtures/db/customerEntitlements.js";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts.js";
import { customers } from "@tests/utils/fixtures/db/customers.js";
import { prices } from "@tests/utils/fixtures/db/prices.js";
import { computeAttachPooledBalanceOps } from "@/internal/billing/v2/pooledBalances/compute/computeAttachPooledBalanceOps.js";
import {
	customerProductToPooledBalanceRemovalOp,
	customerProductToPooledBalanceRestoreOp,
} from "@/internal/billing/v2/pooledBalances/compute/customerProductToPooledBalanceRemovalOp.js";

const CURRENT_EPOCH_MS = Date.UTC(2026, 6, 14);
const STARTS_AT = CURRENT_EPOCH_MS + 86_400_000;
const ENDS_AT = STARTS_AT + 86_400_000;

const createPooledCustomerProduct = ({
	status,
	startsAt,
	endedAt,
}: {
	status: CusProductStatus;
	startsAt: number;
	endedAt?: number | null;
}) => {
	const customerEntitlement = customerEntitlements.create({
		id: "customer_entitlement_messages",
		entitlementId: "entitlement_messages",
		featureId: "messages",
		featureName: "Messages",
		allowance: 500,
		balance: 500,
		customerProductId: "customer_product_entity_pro",
		interval: EntInterval.Month,
		nextResetAt: STARTS_AT + 2_592_000_000,
	});
	customerEntitlement.reset_cycle_anchor = STARTS_AT;
	customerEntitlement.entitlement = {
		...customerEntitlement.entitlement,
		pooled: true,
	};

	return customerProducts.create({
		id: "customer_product_entity_pro",
		productId: "entity_pro",
		customerEntitlements: [customerEntitlement],
		internalEntityId: "internal_entity_one",
		entityId: "entity_one",
		status,
		startsAt,
		endedAt,
	});
};

describe("scheduled pooled balance lifecycle", () => {
	test("a future scheduled source is prepared without contributing early", () => {
		const customerProduct = createPooledCustomerProduct({
			status: CusProductStatus.Scheduled,
			startsAt: STARTS_AT,
		});
		const fullCustomer = customers.create({
			customerProducts: [customerProduct],
		});

		const prepared = computeAttachPooledBalanceOps({
			customerProduct,
			attachBillingContext: {
				currentEpochMs: CURRENT_EPOCH_MS,
				fullCustomer,
				planTiming: "end_of_cycle",
				skipBillingChanges: false,
				billingStartsAt: STARTS_AT,
				requestedBillingCycleAnchor: undefined,
			},
		});

		expect(prepared.pooledBalanceOps).toEqual([]);
		expect(prepared.customerProduct.customer_entitlements[0]?.balance).toBe(0);
	});

	test("an inactive imported source is prepared without contributing", () => {
		const customerProduct = createPooledCustomerProduct({
			status: CusProductStatus.Expired,
			startsAt: CURRENT_EPOCH_MS - 86_400_000,
			endedAt: CURRENT_EPOCH_MS - 1,
		});
		const fullCustomer = customers.create({
			customerProducts: [customerProduct],
		});

		const prepared = computeAttachPooledBalanceOps({
			customerProduct,
			attachBillingContext: {
				currentEpochMs: CURRENT_EPOCH_MS,
				fullCustomer,
				planTiming: "immediate",
				skipBillingChanges: true,
				billingStartsAt: customerProduct.starts_at,
				requestedBillingCycleAnchor: undefined,
			},
		});

		expect(prepared.pooledBalanceOps).toEqual([]);
		expect(prepared.customerProduct.customer_entitlements[0]?.balance).toBe(0);
		expect(prepared.customerProduct.customer_entitlements[0]?.adjustment).toBe(
			0,
		);
	});

	test("activation derives the dormant source grant once after preparation zeroed it", () => {
		const scheduledCustomerProduct = createPooledCustomerProduct({
			status: CusProductStatus.Scheduled,
			startsAt: STARTS_AT,
			endedAt: ENDS_AT,
		});
		const fullCustomer = customers.create({
			customerProducts: [scheduledCustomerProduct],
		});
		const scheduledPreparation = computeAttachPooledBalanceOps({
			customerProduct: scheduledCustomerProduct,
			attachBillingContext: {
				currentEpochMs: CURRENT_EPOCH_MS,
				fullCustomer,
				planTiming: "end_of_cycle",
				skipBillingChanges: false,
				billingStartsAt: STARTS_AT,
				requestedBillingCycleAnchor: undefined,
			},
		});
		const activeCustomerProduct = {
			...scheduledPreparation.customerProduct,
			status: CusProductStatus.Active,
		};

		const prepared = computeAttachPooledBalanceOps({
			customerProduct: activeCustomerProduct,
			attachBillingContext: {
				currentCustomerProduct: scheduledPreparation.customerProduct,
				currentEpochMs: STARTS_AT,
				fullCustomer,
				planTiming: "immediate",
				skipBillingChanges: false,
				billingStartsAt: STARTS_AT,
				requestedBillingCycleAnchor: undefined,
			},
			removeCurrentSource: false,
		});

		expect(prepared.pooledBalanceOps).toEqual([
			expect.objectContaining({
				op: "upsert_source",
				currentCycleContribution: 500,
				nextCycleContribution: 500,
				resetOwnerType: PooledBalanceResetOwnerType.Free,
				sourceCustomerProductId: scheduledCustomerProduct.id,
				sourceEntitlementId: "entitlement_messages",
			}),
		]);
		expect(prepared.customerProduct.customer_entitlements[0]?.balance).toBe(0);
	});

	test("a prepaid source derives its contribution from catalog allowance and options", () => {
		const customerProduct = createPooledCustomerProduct({
			status: CusProductStatus.Active,
			startsAt: CURRENT_EPOCH_MS,
		});
		const customerEntitlement = customerProduct.customer_entitlements[0]!;
		customerEntitlement.balance = 7;
		customerEntitlement.entitlement = {
			...customerEntitlement.entitlement,
			allowance: 100,
		};
		const prepaidPrice = prices.createPrepaid({
			id: "price_messages",
			featureId: "messages",
			internalFeatureId: customerEntitlement.internal_feature_id,
			billingUnits: 25,
			entitlementId: customerEntitlement.entitlement.id,
		});
		customerProduct.customer_prices = [
			prices.createCustomer({
				price: prepaidPrice,
				customerProductId: customerProduct.id,
			}),
		];
		customerProduct.options = [
			{
				feature_id: "messages",
				internal_feature_id: customerEntitlement.internal_feature_id,
				quantity: 3,
				upcoming_quantity: null,
				adjustable_quantity: true,
			},
		];
		customerProduct.subscription_ids = ["subscription_messages"];
		const fullCustomer = customers.create({
			customerProducts: [customerProduct],
		});

		const prepared = computeAttachPooledBalanceOps({
			customerProduct,
			attachBillingContext: {
				currentEpochMs: CURRENT_EPOCH_MS,
				fullCustomer,
				planTiming: "immediate",
				skipBillingChanges: false,
				billingStartsAt: CURRENT_EPOCH_MS,
				requestedBillingCycleAnchor: undefined,
			},
		});

		expect(prepared.pooledBalanceOps).toEqual([
			expect.objectContaining({
				currentCycleContribution: 175,
				nextCycleContribution: 175,
			}),
		]);
	});

	test("an unsupported pooled shape is rejected when it is scheduled", () => {
		const customerProduct = createPooledCustomerProduct({
			status: CusProductStatus.Scheduled,
			startsAt: STARTS_AT,
		});
		const customerEntitlement = customerProduct.customer_entitlements[0]!;
		customerEntitlement.entitlement = {
			...customerEntitlement.entitlement,
			feature: {
				...customerEntitlement.entitlement.feature,
				type: FeatureType.Boolean,
			},
		};
		const fullCustomer = customers.create({
			customerProducts: [customerProduct],
		});

		expect(() =>
			computeAttachPooledBalanceOps({
				customerProduct,
				attachBillingContext: {
					currentEpochMs: CURRENT_EPOCH_MS,
					fullCustomer,
					planTiming: "end_of_cycle",
					skipBillingChanges: false,
					billingStartsAt: STARTS_AT,
					requestedBillingCycleAnchor: undefined,
				},
			}),
		).toThrow("must be a finite metered entitlement");
	});

	test("lifetime sources clear stale reset metadata", () => {
		const customerProduct = createPooledCustomerProduct({
			status: CusProductStatus.Active,
			startsAt: CURRENT_EPOCH_MS,
		});
		const customerEntitlement = customerProduct.customer_entitlements[0]!;
		customerEntitlement.entitlement = {
			...customerEntitlement.entitlement,
			interval: EntInterval.Lifetime,
		};
		const fullCustomer = customers.create({
			customerProducts: [customerProduct],
		});

		const prepared = computeAttachPooledBalanceOps({
			customerProduct,
			attachBillingContext: {
				currentEpochMs: CURRENT_EPOCH_MS,
				fullCustomer,
				planTiming: "immediate",
				skipBillingChanges: false,
				billingStartsAt: CURRENT_EPOCH_MS,
				requestedBillingCycleAnchor: undefined,
			},
		});

		expect(prepared.pooledBalanceOps).toEqual([
			expect.objectContaining({
				resetCycleAnchor: null,
				nextResetAt: null,
			}),
		]);
		expect(
			prepared.customerProduct.customer_entitlements[0]?.reset_cycle_anchor,
		).toBeNull();
		expect(
			prepared.customerProduct.customer_entitlements[0]?.next_reset_at,
		).toBeNull();
	});

	test("rollover configuration is preserved on the pooled source operation", () => {
		const customerProduct = createPooledCustomerProduct({
			status: CusProductStatus.Active,
			startsAt: CURRENT_EPOCH_MS,
		});
		const rollover = {
			duration: RolloverExpiryDurationType.Month,
			length: 2,
			max: 1_000,
			max_percentage: null,
		};
		const customerEntitlement = customerProduct.customer_entitlements[0]!;
		customerEntitlement.entitlement = {
			...customerEntitlement.entitlement,
			rollover,
		};
		const fullCustomer = customers.create({
			customerProducts: [customerProduct],
		});

		const prepared = computeAttachPooledBalanceOps({
			customerProduct,
			attachBillingContext: {
				currentEpochMs: CURRENT_EPOCH_MS,
				fullCustomer,
				planTiming: "immediate",
				skipBillingChanges: false,
				billingStartsAt: CURRENT_EPOCH_MS,
				requestedBillingCycleAnchor: undefined,
			},
		});

		expect(prepared.pooledBalanceOps).toEqual([
			expect.objectContaining({ rollover }),
		]);
	});

	test("automatic expiry removes an active source immediately", () => {
		const activeCustomerProduct = createPooledCustomerProduct({
			status: CusProductStatus.Active,
			startsAt: STARTS_AT,
			endedAt: ENDS_AT,
		});

		expect(
			customerProductToPooledBalanceRemovalOp({
				customerProduct: activeCustomerProduct,
				effectiveAt: null,
			}),
		).toEqual({
			op: "remove_source",
			internalCustomerId: activeCustomerProduct.internal_customer_id,
			sourceCustomerProductId: activeCustomerProduct.id,
			effectiveAt: null,
		});
	});

	test("cancel before start neither removes nor restores a contribution", () => {
		const scheduledCustomerProduct = createPooledCustomerProduct({
			status: CusProductStatus.Scheduled,
			startsAt: STARTS_AT,
		});

		expect(
			customerProductToPooledBalanceRemovalOp({
				customerProduct: scheduledCustomerProduct,
				effectiveAt: null,
			}),
		).toBeUndefined();
		expect(
			customerProductToPooledBalanceRestoreOp({
				customerProduct: scheduledCustomerProduct,
				expectedEffectiveAt: STARTS_AT,
			}),
		).toBeUndefined();
	});

	test("a phase change can place activation and expiry in one pooled operation batch", () => {
		const outgoingCustomerProduct = createPooledCustomerProduct({
			status: CusProductStatus.Active,
			startsAt: CURRENT_EPOCH_MS,
			endedAt: STARTS_AT,
		});
		const incomingScheduledCustomerProduct = {
			...createPooledCustomerProduct({
				status: CusProductStatus.Scheduled,
				startsAt: STARTS_AT,
			}),
			id: "customer_product_entity_premium",
		};
		const incomingActiveCustomerProduct = {
			...incomingScheduledCustomerProduct,
			status: CusProductStatus.Active,
		};
		const fullCustomer = customers.create({
			customerProducts: [
				outgoingCustomerProduct,
				incomingScheduledCustomerProduct,
			],
		});
		const activation = computeAttachPooledBalanceOps({
			customerProduct: incomingActiveCustomerProduct,
			attachBillingContext: {
				currentCustomerProduct: incomingScheduledCustomerProduct,
				currentEpochMs: STARTS_AT,
				fullCustomer,
				planTiming: "immediate",
				skipBillingChanges: false,
				billingStartsAt: STARTS_AT,
				requestedBillingCycleAnchor: undefined,
			},
			removeCurrentSource: false,
		});
		const expiry = customerProductToPooledBalanceRemovalOp({
			customerProduct: outgoingCustomerProduct,
			effectiveAt: null,
		});
		const phaseChangeOperations = [
			...activation.pooledBalanceOps,
			...(expiry ? [expiry] : []),
		];

		expect(phaseChangeOperations.map((operation) => operation.op)).toEqual([
			"upsert_source",
			"remove_source",
		]);
	});
});
