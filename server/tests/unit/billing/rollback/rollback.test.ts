import { expect, test } from "bun:test";
import { type AutumnBillingPlan, CusProductStatus } from "@autumn/shared";
import { computeRollbackPlan } from "@/internal/billing/v2/actions/rollback/compute/computeRollbackPlan";
import { applyAutumnBillingPlanToFullCustomer } from "@/internal/billing/v2/utils/autumnBillingPlanToFinalFullCustomer";
import {
	makeAutumnBillingPlan,
	makeCustomerEntitlement,
	makePatch,
	makeUpdate,
} from "../billing-change-response/helpers/makeAutumnBillingPlan";
import { makeFullCusProduct } from "../billing-change-response/helpers/makeFullCusProduct";
import { makeFullCustomer } from "../billing-change-response/helpers/makeFullCustomer";

test.concurrent(
	"computes a plan that restores the original customer state",
	() => {
		const updated = makeFullCusProduct({ planId: "updated" });
		const patched = makeFullCusProduct({ planId: "patched" });
		const deleted = makeFullCusProduct({ planId: "deleted" });
		const inserted = makeFullCusProduct({ planId: "inserted" });
		const oldEntitlement = makeCustomerEntitlement({ featureId: "old" });
		const newEntitlement = makeCustomerEntitlement({ featureId: "new" });
		oldEntitlement.customer_product_id = patched.id;
		newEntitlement.customer_product_id = patched.id;
		const replaceable = {
			id: "rep_old",
			cus_ent_id: oldEntitlement.id,
			created_at: 1_700_000_000_000,
			from_entity_id: null,
			delete_next_cycle: false,
		};
		oldEntitlement.replaceables = [replaceable];
		patched.customer_entitlements = [oldEntitlement];

		const before = makeFullCustomer({
			customerProducts: [updated, patched, deleted],
		});
		const autumnBillingPlan: AutumnBillingPlan = {
			...makeAutumnBillingPlan({
				inserts: [inserted],
				update: makeUpdate({
					customerProduct: updated,
					updates: { status: CusProductStatus.Expired, canceled_at: 123 },
				}),
				deletes: [deleted],
				patches: [
					makePatch({
						customerProduct: patched,
						insertEntitlements: [newEntitlement],
						deleteEntitlements: [oldEntitlement],
					}),
				],
			}),
			updateCustomerEntitlements: [
				{
					customerEntitlement: oldEntitlement,
					balanceChange: 10,
				},
				{
					customerEntitlement: newEntitlement,
					balanceChange: 20,
				},
			],
		};
		const committed = applyAutumnBillingPlanToFullCustomer({
			fullCustomer: before,
			autumnBillingPlan,
		});

		const rollbackPlan = computeRollbackPlan({ autumnBillingPlan });
		const restored = applyAutumnBillingPlanToFullCustomer({
			fullCustomer: committed,
			autumnBillingPlan: rollbackPlan,
		});

		expect(restored).toEqual(before);
		expect(autumnBillingPlan.insertCustomerProducts).toEqual([inserted]);
		expect(rollbackPlan.updateCustomerEntitlements).toContainEqual({
			customerEntitlement: oldEntitlement,
			insertReplaceables: [replaceable],
		});
	},
);

test.concurrent("restores only fields touched by absolute updates", () => {
	const customerProduct = makeFullCusProduct({ planId: "updated" });
	const customerEntitlement = makeCustomerEntitlement({
		featureId: "messages",
	});
	customerEntitlement.customer_product_id = customerProduct.id;
	customerEntitlement.balance = 100;
	customerEntitlement.adjustment = 5;
	customerProduct.customer_entitlements = [customerEntitlement];
	const autumnBillingPlan: AutumnBillingPlan = {
		...makeAutumnBillingPlan({
			update: makeUpdate({
				customerProduct,
				updates: { canceled_at: null },
			}),
		}),
		updateCustomerEntitlements: [
			{
				customerEntitlement,
				balanceChange: 50,
				updates: { balance: 25 },
			},
		],
	};

	const rollbackPlan = computeRollbackPlan({ autumnBillingPlan });

	expect(rollbackPlan.updateCustomerProducts).toEqual([
		{
			customerProduct: { ...customerProduct, canceled_at: null },
			updates: { canceled_at: customerProduct.canceled_at },
		},
	]);
	expect(rollbackPlan.updateCustomerEntitlements).toEqual([
		{
			customerEntitlement,
			updates: { balance: 100 },
		},
	]);
});

test.concurrent(
	"reverses entitlement deltas and replaceables in reverse order",
	() => {
		const customerProduct = makeFullCusProduct({ planId: "updated" });
		const first = makeCustomerEntitlement({ featureId: "first" });
		const second = makeCustomerEntitlement({ featureId: "second" });
		first.customer_product_id = customerProduct.id;
		second.customer_product_id = customerProduct.id;
		const insertedReplaceable = {
			id: "rep_inserted",
			cus_ent_id: first.id,
			created_at: 1_700_000_000_000,
		};
		const deletedReplaceable = {
			...insertedReplaceable,
			id: "rep_deleted",
			from_entity_id: null,
			delete_next_cycle: false,
		};
		const autumnBillingPlan: AutumnBillingPlan = {
			...makeAutumnBillingPlan(),
			updateCustomerEntitlements: [
				{
					customerEntitlement: first,
					balanceChange: 20,
					insertReplaceables: [insertedReplaceable],
					deletedReplaceables: [deletedReplaceable],
				},
				{
					customerEntitlement: second,
					balanceChange: -5,
				},
			],
		};

		expect(
			computeRollbackPlan({ autumnBillingPlan }).updateCustomerEntitlements,
		).toEqual([
			{
				customerEntitlement: second,
				balanceChange: 5,
				insertReplaceables: undefined,
				deletedReplaceables: undefined,
			},
			{
				customerEntitlement: first,
				balanceChange: -20,
				insertReplaceables: [deletedReplaceable],
				deletedReplaceables: [
					{
						...insertedReplaceable,
						from_entity_id: null,
						delete_next_cycle: false,
					},
				],
			},
		]);
	},
);

test.concurrent(
	"ignores inert fields and rejects populated unsupported operations",
	() => {
		const inertPlan = {
			...makeAutumnBillingPlan(),
			customPrices: [],
			customEntitlements: [],
			insertCustomerEntitlements: [],
			lineItems: [],
			customLineItems: [],
		};

		expect(computeRollbackPlan({ autumnBillingPlan: inertPlan })).toEqual({
			customerId: inertPlan.customerId,
			insertCustomerProducts: [],
		});

		for (const field of [
			"insertEntities",
			"customPrices",
			"insertPlanLicenses",
			"customerLicenseUpdates",
			"oneOffPurchaseRebalance",
			"autoTopupRebalance",
			"schedulePhaseCustomerProductReplacements",
			"futureOperation",
		]) {
			const autumnBillingPlan = {
				...makeAutumnBillingPlan(),
				[field]: [{}],
			} as AutumnBillingPlan;

			expect(() => computeRollbackPlan({ autumnBillingPlan })).toThrow(field);
		}

		const customerProduct = makeFullCusProduct({ planId: "overlap" });
		expect(
			computeRollbackPlan({
				autumnBillingPlan: makeAutumnBillingPlan({
					inserts: [customerProduct],
					deletes: [customerProduct],
				}),
			}),
		).toEqual({
			customerId: "cus_test",
			insertCustomerProducts: [],
		});
	},
);

test.concurrent(
	"omits operations dominated by product lifecycle changes",
	() => {
		const customerProduct = makeFullCusProduct({ planId: "transient" });
		const customerEntitlement = makeCustomerEntitlement({
			featureId: "transient",
		});
		customerEntitlement.customer_product_id = customerProduct.id;
		const autumnBillingPlan: AutumnBillingPlan = {
			...makeAutumnBillingPlan({
				inserts: [customerProduct],
				updates: [
					makeUpdate({
						customerProduct,
						updates: { status: CusProductStatus.Expired },
					}),
				],
				patches: [makePatch({ customerProduct })],
			}),
			updateCustomerEntitlements: [{ customerEntitlement, balanceChange: 1 }],
		};

		expect(computeRollbackPlan({ autumnBillingPlan })).toEqual({
			customerId: autumnBillingPlan.customerId,
			insertCustomerProducts: [],
			deleteCustomerProducts: [customerProduct],
		});
	},
);

test.concurrent(
	"rejects duplicate deletes that rollback would reinsert",
	() => {
		const customerProduct = makeFullCusProduct({ planId: "duplicate" });
		const customerEntitlement = makeCustomerEntitlement({
			featureId: "duplicate",
		});
		customerEntitlement.customer_product_id = customerProduct.id;
		const replaceable = {
			id: "rep_duplicate",
			cus_ent_id: customerEntitlement.id,
			created_at: 1_700_000_000_000,
			from_entity_id: null,
			delete_next_cycle: false,
		};

		const plans = [
			makeAutumnBillingPlan({
				deleteOne: customerProduct,
				deletes: [customerProduct],
			}),
			makeAutumnBillingPlan({
				patches: [
					makePatch({
						customerProduct,
						deleteEntitlements: [customerEntitlement, customerEntitlement],
					}),
				],
			}),
			{
				...makeAutumnBillingPlan(),
				updateCustomerEntitlements: [
					{
						customerEntitlement,
						deletedReplaceables: [replaceable],
					},
					{
						customerEntitlement,
						deletedReplaceables: [replaceable],
					},
				],
			},
		] satisfies AutumnBillingPlan[];

		for (const autumnBillingPlan of plans) {
			expect(() => computeRollbackPlan({ autumnBillingPlan })).toThrow(
				"duplicate",
			);
		}
	},
);

const makePooledCustomerEntitlement = ({
	featureId,
	stripeSubscriptionId,
}: {
	featureId: string;
	stripeSubscriptionId: string;
}) => {
	const pooledCustomerEntitlement = makeCustomerEntitlement({ featureId });
	pooledCustomerEntitlement.is_pooled_balance = true;
	pooledCustomerEntitlement.pooled_balance = {
		id: `pool_${featureId}`,
		org_id: "org_test",
		env: "sandbox",
		internal_customer_id: "internal_cus_test",
		internal_feature_id: `internal_${featureId}`,
		granted: 10_000,
		interval: "month",
		interval_count: 1,
		reset_cycle_anchor: 1_700_000_000_000,
		reset_mode: "subscription",
		stripe_subscription_id: stripeSubscriptionId,
		customer_license_link_id: null,
		rollover_signature: "none",
		customer_entitlement_id: pooledCustomerEntitlement.id,
		last_applied_reset_at: null,
		created_at: 1_700_000_000_000,
		updated_at: 1_700_000_000_000,
	} as NonNullable<typeof pooledCustomerEntitlement.pooled_balance>;
	return pooledCustomerEntitlement;
};

const makePoolContribution = ({ poolId }: { poolId: string }) => ({
	id: `pool_contribution_${poolId}`,
	pooled_balance_id: poolId,
	source_customer_product_id: "cus_prod_source",
	source_customer_entitlement_id: "cus_ent_source",
	current_contribution: 10_000,
	next_cycle_contribution: 10_000,
	effective_at: null,
	created_at: 1_700_000_000_000,
	updated_at: 1_700_000_000_000,
});

test.concurrent("inverts pooled balance inserts and delta updates", () => {
	const insertedPool = makePooledCustomerEntitlement({
		featureId: "pooled_new",
		stripeSubscriptionId: "sub_new",
	});
	const existingPool = makePooledCustomerEntitlement({
		featureId: "pooled_existing",
		stripeSubscriptionId: "sub_existing",
	});
	const contribution = makePoolContribution({
		poolId: insertedPool.pooled_balance?.id ?? "",
	});
	const autumnBillingPlan: AutumnBillingPlan = {
		...makeAutumnBillingPlan(),
		pooledBalancePlan: {
			insertPoolBalances: [insertedPool],
			updatePoolBalances: [
				{
					pooledCustomerEntitlement: insertedPool,
					balanceDelta: 10_000,
					grantedDelta: 10_000,
				},
				{
					pooledCustomerEntitlement: existingPool,
					balanceDelta: 250,
					grantedDelta: 500,
				},
			],
			expirePoolBalanceCandidates: [],
			insertPoolRollovers: [],
			insertPoolContributions: [contribution],
			updatePoolContributions: [],
			deletePoolContributions: [],
		},
	};

	expect(computeRollbackPlan({ autumnBillingPlan }).pooledBalancePlan).toEqual({
		insertPoolBalances: [],
		// The update targeting the same-plan-inserted pool is dominated by its delete.
		updatePoolBalances: [
			{
				pooledCustomerEntitlement: existingPool,
				balanceDelta: -250,
				grantedDelta: -500,
			},
		],
		expirePoolBalanceCandidates: [],
		insertPoolRollovers: [],
		insertPoolContributions: [],
		updatePoolContributions: [],
		deletePoolContributions: [contribution],
		deletePoolBalances: [insertedPool],
	});

	const emptyPooledPlan: AutumnBillingPlan = {
		...makeAutumnBillingPlan(),
		pooledBalancePlan: {
			insertPoolBalances: [],
			updatePoolBalances: [],
			expirePoolBalanceCandidates: [],
			insertPoolRollovers: [],
			insertPoolContributions: [],
			updatePoolContributions: [],
			deletePoolContributions: [],
		},
	};
	expect(
		computeRollbackPlan({ autumnBillingPlan: emptyPooledPlan })
			.pooledBalancePlan,
	).toBeUndefined();
});

test.concurrent(
	"rejects pooled operations that destroyed unrecorded state",
	() => {
		const pool = makePooledCustomerEntitlement({
			featureId: "pooled_reject",
			stripeSubscriptionId: "sub_reject",
		});
		const contribution = makePoolContribution({
			poolId: pool.pooled_balance?.id ?? "",
		});
		const uninvertibleSections = {
			updatePoolContributions: [contribution],
			deletePoolContributions: [contribution],
			deletePoolBalances: [pool],
			expirePoolBalanceCandidates: [
				{ pooledCustomerEntitlement: pool, expiresAt: 1_700_000_000_000 },
			],
			insertPoolRollovers: [{ id: "rollover_reject" }],
		};

		for (const [section, value] of Object.entries(uninvertibleSections)) {
			const autumnBillingPlan = {
				...makeAutumnBillingPlan(),
				pooledBalancePlan: {
					insertPoolBalances: [],
					updatePoolBalances: [],
					expirePoolBalanceCandidates: [],
					insertPoolRollovers: [],
					insertPoolContributions: [],
					updatePoolContributions: [],
					deletePoolContributions: [],
					[section]: value,
				},
			} as AutumnBillingPlan;

			expect(() => computeRollbackPlan({ autumnBillingPlan })).toThrow(section);
		}
	},
);
