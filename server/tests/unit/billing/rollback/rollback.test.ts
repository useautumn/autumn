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
