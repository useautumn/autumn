/**
 * Multi-Entity Quantity Proration Config Tests
 *
 * Tests 1-3: ProrateNextCycle behavior with entity-scoped prepaid products.
 *   Balance updates immediately but charge/credit is deferred to next cycle invoice.
 *   All use file-level constants: BILLING_UNITS=10, PRICE_PER_UNIT=5, INCLUDED_USAGE=20.
 *
 * Tests 4-5: OnDecrease.None behavior with entity-scoped prepaid products.
 *   Decrease is scheduled for next cycle (no credit), balance stays until renewal.
 *   Use local constants: billingUnits=100, pricePerUnit=10, includedUsage=100.
 *
 * Test 1: ProrateNextCycle increase — entity gets balance immediately, billing deferred
 * Test 2: ProrateNextCycle decrease — balance changes immediately, credit deferred
 * Test 3: Mixed — one entity increases (ProrateNextCycle), other decreases (ProrateImmediately)
 * Test 4: OnDecrease.None — no credit invoice on decrease
 * Test 5: OnDecrease.None — decrease then increase back (net zero)
 */

import { expect, test } from "bun:test";
import { type ApiCustomerV3, OnDecrease, OnIncrease } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect.js";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect.js";
import { expectProductItemCorrect } from "@tests/integration/billing/utils/expectProductItemCorrect.js";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { calculateProratedDiff } from "@tests/integration/billing/utils/proration";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

// ── File-level constants for Tests 1-3 ──
const BILLING_UNITS = 10;
const PRICE_PER_UNIT = 5;
const INCLUDED_USAGE = 20;

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: ProrateNextCycle increase — balance now, billing deferred
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Entity 1 starts with 100 units. Cost = (100-20)/10 * $5 = $40.
 * Entity 2 starts with 50 units. Cost = (50-20)/10 * $5 = $15.
 *
 * Entity 1 increases to 200 units. New cost = (200-20)/10 * $5 = $90.
 * Preview shows $0 (deferred). Balance updates immediately to 200.
 * Entity 2 is unchanged.
 *
 * After advancing to next cycle:
 *   Renewal = $90 (entity1) + $15 (entity2) = $105
 *   Plus prorated increase deferred from mid-cycle.
 */
test.concurrent(`${chalk.yellowBright("multi-entity-proration: ProrateNextCycle increase — balance now, billing deferred")}`, async () => {
	const customerId = "multi-ent-proration-increase";

	const prepaidItem = items.prepaid({
		featureId: TestFeature.Messages,
		billingUnits: BILLING_UNITS,
		price: PRICE_PER_UNIT,
		includedUsage: INCLUDED_USAGE,
		config: {
			on_increase: OnIncrease.ProrateNextCycle,
			on_decrease: OnDecrease.ProrateNextCycle,
		},
	});

	const product = products.base({
		id: "prepaid",
		items: [prepaidItem],
	});

	const initialQuantity1 = 10 * BILLING_UNITS; // 100
	const initialQuantity2 = 5 * BILLING_UNITS; // 50
	const newQuantity1 = 20 * BILLING_UNITS; // 200

	// Costs: (qty - includedUsage) / billingUnits * pricePerUnit
	const entity1OldCost =
		((initialQuantity1 - INCLUDED_USAGE) / BILLING_UNITS) * PRICE_PER_UNIT; // $40
	const entity1NewCost =
		((newQuantity1 - INCLUDED_USAGE) / BILLING_UNITS) * PRICE_PER_UNIT; // $90
	const entity2Cost =
		((initialQuantity2 - INCLUDED_USAGE) / BILLING_UNITS) * PRICE_PER_UNIT; // $15
	const renewalAmount = entity1NewCost + entity2Cost; // $105

	const { autumnV1, ctx, entities, testClockId, advancedTo } =
		await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [product] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.billing.attach({
					productId: product.id,
					entityIndex: 0,
					options: [
						{
							feature_id: TestFeature.Messages,
							quantity: initialQuantity1,
						},
					],
				}),
				s.billing.attach({
					productId: product.id,
					entityIndex: 1,
					options: [
						{
							feature_id: TestFeature.Messages,
							quantity: initialQuantity2,
						},
					],
				}),
			],
		});

	const beforeCustomer =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const invoiceCountBefore = beforeCustomer.invoices?.length ?? 0;

	// Preview the upgrade — should be $0 (deferred to next cycle)
	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		entity_id: entities[0].id,
		product_id: product.id,
		options: [{ feature_id: TestFeature.Messages, quantity: newQuantity1 }],
	});
	expect(preview.total).toBe(0);

	// Calculate prorated diff BEFORE advancing (billing period changes after)
	const proratedIncrease = await calculateProratedDiff({
		customerId,
		advancedTo,
		oldAmount: entity1OldCost,
		newAmount: entity1NewCost,
	});

	// Execute the upgrade
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entities[0].id,
		product_id: product.id,
		options: [{ feature_id: TestFeature.Messages, quantity: newQuantity1 }],
	});

	// Balance updates immediately to 200
	const entity1 = await autumnV1.entities.get(customerId, entities[0].id);
	expectCustomerFeatureCorrect({
		customer: entity1,
		featureId: TestFeature.Messages,
		balance: newQuantity1,
	});

	// Entity 2 unchanged
	const entity2 = await autumnV1.entities.get(customerId, entities[1].id);
	expectCustomerFeatureCorrect({
		customer: entity2,
		featureId: TestFeature.Messages,
		balance: initialQuantity2,
	});

	// No new finalized invoice created yet
	const afterUpdate = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const finalizedAfter = afterUpdate.invoices?.filter(
		(inv) => inv.status === "paid" || inv.status === "open",
	);
	expect(finalizedAfter?.length).toBe(invoiceCountBefore);

	// Advance to next cycle — deferred proration + renewal should appear
	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	const afterCycle = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerInvoiceCorrect({
		customer: afterCycle,
		count: invoiceCountBefore + 1,
		latestStatus: "paid",
		latestTotal: renewalAmount + proratedIncrease,
	});

	await expectStripeSubscriptionCorrect({ ctx, customerId });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: ProrateNextCycle decrease — balance changes immediately, credit deferred
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Entity 1 starts with 200 units. Cost = (200-20)/10 * $5 = $90.
 * Entity 2 starts with 100 units. Cost = (100-20)/10 * $5 = $40.
 *
 * Entity 1 decreases to 50 units. New cost = (50-20)/10 * $5 = $15.
 * Preview shows $0 (deferred). Balance changes immediately to 50.
 *
 * After advancing to next cycle:
 *   Renewal = $15 (entity1) + $40 (entity2) = $55
 *   Plus prorated credit deferred from mid-cycle (negative).
 */
test.concurrent(`${chalk.yellowBright("multi-entity-proration: ProrateNextCycle decrease — immediate balance, deferred credit")}`, async () => {
	const customerId = "multi-ent-proration-decrease";

	const prepaidItem = items.prepaid({
		featureId: TestFeature.Messages,
		billingUnits: BILLING_UNITS,
		price: PRICE_PER_UNIT,
		includedUsage: INCLUDED_USAGE,
		config: {
			on_increase: OnIncrease.ProrateNextCycle,
			on_decrease: OnDecrease.ProrateNextCycle,
		},
	});

	const product = products.base({
		id: "prepaid",
		items: [prepaidItem],
	});

	const initialQuantity1 = 20 * BILLING_UNITS; // 200
	const initialQuantity2 = 10 * BILLING_UNITS; // 100
	const newQuantity1 = 5 * BILLING_UNITS; // 50

	// Costs
	const entity1OldCost =
		((initialQuantity1 - INCLUDED_USAGE) / BILLING_UNITS) * PRICE_PER_UNIT; // $90
	const entity1NewCost =
		((newQuantity1 - INCLUDED_USAGE) / BILLING_UNITS) * PRICE_PER_UNIT; // $15
	const entity2Cost =
		((initialQuantity2 - INCLUDED_USAGE) / BILLING_UNITS) * PRICE_PER_UNIT; // $40
	const renewalAmount = entity1NewCost + entity2Cost; // $55

	const { autumnV1, ctx, entities, testClockId, advancedTo } =
		await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [product] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.billing.attach({
					productId: product.id,
					entityIndex: 0,
					options: [
						{
							feature_id: TestFeature.Messages,
							quantity: initialQuantity1,
						},
					],
				}),
				s.billing.attach({
					productId: product.id,
					entityIndex: 1,
					options: [
						{
							feature_id: TestFeature.Messages,
							quantity: initialQuantity2,
						},
					],
				}),
			],
		});

	const beforeCustomer =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const invoiceCountBefore = beforeCustomer.invoices?.length ?? 0;

	// Preview the downgrade — should be $0 (deferred)
	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		entity_id: entities[0].id,
		product_id: product.id,
		options: [{ feature_id: TestFeature.Messages, quantity: newQuantity1 }],
	});
	expect(preview.total).toBe(0);

	// Calculate prorated diff BEFORE advancing
	const proratedCredit = await calculateProratedDiff({
		customerId,
		advancedTo,
		oldAmount: entity1OldCost,
		newAmount: entity1NewCost,
	});

	// Execute the downgrade
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entities[0].id,
		product_id: product.id,
		options: [{ feature_id: TestFeature.Messages, quantity: newQuantity1 }],
	});

	// Balance changes immediately to 50 (billing is deferred, not balance)
	const entity1After = await autumnV1.entities.get(customerId, entities[0].id);
	expectCustomerFeatureCorrect({
		customer: entity1After,
		featureId: TestFeature.Messages,
		balance: newQuantity1,
	});

	// Entity 2 unchanged
	const entity2After = await autumnV1.entities.get(customerId, entities[1].id);
	expectCustomerFeatureCorrect({
		customer: entity2After,
		featureId: TestFeature.Messages,
		balance: initialQuantity2,
	});

	// No new invoice created yet
	const afterUpdate = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerInvoiceCorrect({
		customer: afterUpdate,
		count: invoiceCountBefore,
	});

	// Advance to next cycle — deferred credit applied to renewal invoice
	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	const entity1PostCycle = await autumnV1.entities.get(
		customerId,
		entities[0].id,
	);
	expectCustomerFeatureCorrect({
		customer: entity1PostCycle,
		featureId: TestFeature.Messages,
		balance: newQuantity1,
	});

	// Entity 2 still at its original allocation (renewed)
	const entity2PostCycle = await autumnV1.entities.get(
		customerId,
		entities[1].id,
	);
	expectCustomerFeatureCorrect({
		customer: entity2PostCycle,
		featureId: TestFeature.Messages,
		balance: initialQuantity2,
	});

	// Renewal invoice = renewal amount + prorated credit (negative)
	const afterCycle = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerInvoiceCorrect({
		customer: afterCycle,
		count: invoiceCountBefore + 1,
		latestStatus: "paid",
		latestTotal: renewalAmount + proratedCredit,
	});

	await expectStripeSubscriptionCorrect({ ctx, customerId });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: OnDecrease.None — no credit invoice on decrease
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Entity 1 starts with 400 units. Packs = (400-100)/100 = 3, cost = 3 * $10 = $30.
 * Entity 2 starts with 300 units. Packs = (300-100)/100 = 2, cost = 2 * $10 = $20.
 *
 * Entity 1 decreases to 200 units. Packs = (200-100)/100 = 1, cost = 1 * $10 = $10.
 * With OnDecrease.None:
 *   - Preview = $0, no credit invoice
 *   - Balance stays at 400 until next cycle
 *   - After cycle: balance becomes 200, renewal = $10 + $20 = $30 (flat, no proration)
 */
test.concurrent(`${chalk.yellowBright("multi-entity-proration: OnDecrease.None — no credit invoice")}`, async () => {
	const customerId = "multi-ent-proration-no-decrease";
	const billingUnits = 100;
	const pricePerUnit = 10;
	const includedUsage = 100;

	const prepaidItem = items.prepaid({
		featureId: TestFeature.Messages,
		billingUnits,
		price: pricePerUnit,
		includedUsage,
		config: {
			on_increase: OnIncrease.ProrateImmediately,
			on_decrease: OnDecrease.None,
		},
	});

	const product = products.base({
		id: "prepaid",
		items: [prepaidItem],
	});

	const initialQuantity1 = 4 * billingUnits; // 400
	const initialQuantity2 = 3 * billingUnits; // 300
	const newQuantity1 = 2 * billingUnits; // 200

	// Costs
	const entity1NewCost =
		((newQuantity1 - includedUsage) / billingUnits) * pricePerUnit; // $10
	const entity2Cost =
		((initialQuantity2 - includedUsage) / billingUnits) * pricePerUnit; // $20
	const renewalAmount = entity1NewCost + entity2Cost; // $30

	const { autumnV1, ctx, entities, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [product] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({
				productId: product.id,
				entityIndex: 0,
				options: [
					{
						feature_id: TestFeature.Messages,
						quantity: initialQuantity1,
					},
				],
			}),
			s.billing.attach({
				productId: product.id,
				entityIndex: 1,
				options: [
					{
						feature_id: TestFeature.Messages,
						quantity: initialQuantity2,
					},
				],
			}),
		],
	});

	const beforeInvoices =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const invoiceCountBefore = beforeInvoices.invoices?.length ?? 0;

	// Preview the downgrade — should be $0 (no immediate credit)
	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		entity_id: entities[0].id,
		product_id: product.id,
		options: [{ feature_id: TestFeature.Messages, quantity: newQuantity1 }],
	});
	expect(preview.total).toBe(0);

	// Execute the downgrade
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entities[0].id,
		product_id: product.id,
		options: [{ feature_id: TestFeature.Messages, quantity: newQuantity1 }],
	});

	// Balance stays at 400 (OnDecrease.None keeps old balance until next cycle)
	const entity1After = await autumnV1.entities.get(customerId, entities[0].id);
	expectCustomerFeatureCorrect({
		customer: entity1After,
		featureId: TestFeature.Messages,
		balance: initialQuantity1,
	});

	// No new invoice created
	const afterUpdate = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerInvoiceCorrect({
		customer: afterUpdate,
		count: invoiceCountBefore,
	});

	// Entity 2 unchanged
	const entity2 = await autumnV1.entities.get(customerId, entities[1].id);
	expectCustomerFeatureCorrect({
		customer: entity2,
		featureId: TestFeature.Messages,
		balance: initialQuantity2,
	});

	// Advance to next cycle
	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	// After cycle: entity 1 balance = 200 (new quantity takes effect)
	const afterAdvance = await autumnV1.entities.get(customerId, entities[0].id);
	expectCustomerFeatureCorrect({
		customer: afterAdvance,
		featureId: TestFeature.Messages,
		balance: newQuantity1,
	});

	// Renewal invoice: flat renewal, no proration adjustments
	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerInvoiceCorrect({
		customer: customerAfter,
		count: invoiceCountBefore + 1,
		latestTotal: renewalAmount,
	});

	await expectStripeSubscriptionCorrect({ ctx, customerId });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: OnDecrease.None — decrease then increase back (net zero)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Entity 1 starts with 400 units (cost $30). Entity 2 starts with 300 (cost $20).
 *
 * Entity 1 decreases 400->200 (OnDecrease.None: no invoice, balance stays 400).
 * Entity 1 increases back to 400 (no-op: current Stripe sub is still at 400).
 *   Preview = $0, no new invoice.
 *
 * After cycle: renewal = $30 + $20 = $50 (original amounts, net change = 0).
 */
test.concurrent(`${chalk.yellowBright("multi-entity-proration: OnDecrease.None — decrease then increase back (net zero)")}`, async () => {
	const customerId = "multi-ent-proration-none-netzero";
	const billingUnits = 100;
	const pricePerUnit = 10;
	const includedUsage = 100;

	const prepaidItem = items.prepaid({
		featureId: TestFeature.Messages,
		billingUnits,
		price: pricePerUnit,
		includedUsage,
		config: {
			on_increase: OnIncrease.ProrateImmediately,
			on_decrease: OnDecrease.None,
		},
	});

	const product = products.base({
		id: "prepaid",
		items: [prepaidItem],
	});

	const initialQuantity1 = 4 * billingUnits; // 400
	const initialQuantity2 = 3 * billingUnits; // 300

	// Costs
	const entity1Cost =
		((initialQuantity1 - includedUsage) / billingUnits) * pricePerUnit; // $30
	const entity2Cost =
		((initialQuantity2 - includedUsage) / billingUnits) * pricePerUnit; // $20
	const renewalAmount = entity1Cost + entity2Cost; // $50

	const { autumnV1, ctx, entities, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [product] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({
				productId: product.id,
				entityIndex: 0,
				options: [
					{
						feature_id: TestFeature.Messages,
						quantity: initialQuantity1,
					},
				],
			}),
			s.billing.attach({
				productId: product.id,
				entityIndex: 1,
				options: [
					{
						feature_id: TestFeature.Messages,
						quantity: initialQuantity2,
					},
				],
			}),
		],
	});

	const beforeInvoices =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const invoiceCountBefore = beforeInvoices.invoices?.length ?? 0;

	// ── Step 1: Decrease entity 1 from 400 -> 200 ──
	const decreasePreview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		entity_id: entities[0].id,
		product_id: product.id,
		options: [
			{
				feature_id: TestFeature.Messages,
				quantity: 2 * billingUnits, // 200
			},
		],
	});
	expect(decreasePreview.total).toBe(0);

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entities[0].id,
		product_id: product.id,
		options: [
			{
				feature_id: TestFeature.Messages,
				quantity: 2 * billingUnits, // 200
			},
		],
	});

	// Balance stays at 400 (OnDecrease.None)
	const entity1AfterDecrease = await autumnV1.entities.get(
		customerId,
		entities[0].id,
	);
	expectCustomerFeatureCorrect({
		customer: entity1AfterDecrease,
		featureId: TestFeature.Messages,
		balance: initialQuantity1,
	});

	// Verify product item: quantity=400, upcomingQuantity=200
	await expectProductItemCorrect({
		customer: entity1AfterDecrease,
		productId: product.id,
		featureId: TestFeature.Messages,
		quantity: initialQuantity1 - includedUsage,
		upcomingQuantity: 2 * billingUnits - includedUsage,
	});

	// No new invoice
	const afterDecrease = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerInvoiceCorrect({
		customer: afterDecrease,
		count: invoiceCountBefore,
	});

	// ── Step 2: Increase entity 1 back to 400 (no-op) ──
	const increasePreview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		entity_id: entities[0].id,
		product_id: product.id,
		options: [{ feature_id: TestFeature.Messages, quantity: initialQuantity1 }],
	});
	expect(increasePreview.total).toBe(0);

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entities[0].id,
		product_id: product.id,
		options: [{ feature_id: TestFeature.Messages, quantity: initialQuantity1 }],
	});

	// Balance still 400
	const entity1AfterIncrease = await autumnV1.entities.get(
		customerId,
		entities[0].id,
	);
	expectCustomerFeatureCorrect({
		customer: entity1AfterIncrease,
		featureId: TestFeature.Messages,
		balance: initialQuantity1,
	});

	// Verify product item: quantity=400, upcomingQuantity should be gone (back to original)
	await expectProductItemCorrect({
		customer: entity1AfterIncrease,
		productId: product.id,
		featureId: TestFeature.Messages,
		quantity: initialQuantity1 - includedUsage,
		upcomingQuantity: 300,
	});

	// Still no new invoices (increase back was a no-op)
	const afterIncrease = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerInvoiceCorrect({
		customer: afterIncrease,
		count: invoiceCountBefore,
	});

	// ── Step 3: Advance to next cycle ──
	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	// Renewal: original amounts since net change = 0
	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerInvoiceCorrect({
		customer: customerAfter,
		count: invoiceCountBefore + 1,
		latestTotal: renewalAmount,
	});

	// Entity 1 balance renewed at 400 (original quantity)
	const entity1PostCycle = await autumnV1.entities.get(
		customerId,
		entities[0].id,
	);
	expectCustomerFeatureCorrect({
		customer: entity1PostCycle,
		featureId: TestFeature.Messages,
		balance: initialQuantity1,
	});

	// Entity 2 unchanged
	const entity2PostCycle = await autumnV1.entities.get(
		customerId,
		entities[1].id,
	);
	expectCustomerFeatureCorrect({
		customer: entity2PostCycle,
		featureId: TestFeature.Messages,
		balance: initialQuantity2,
	});

	await expectStripeSubscriptionCorrect({ ctx, customerId });
});
