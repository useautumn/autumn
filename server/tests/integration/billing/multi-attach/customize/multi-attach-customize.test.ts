/**
 * Multi-Attach Customize Tests
 *
 * Tests for the per-plan `customize` field in billing.multi_attach.
 * Each plan can independently override its base price or items.
 *
 * Key behaviors:
 * - Different custom prices per plan
 * - Different custom items per plan (add/change features)
 */

import { expect, test } from "bun:test";
import { type ApiCustomerV3, BillingInterval } from "@autumn/shared";
import {
	expectCustomerFeatureCorrect,
	expectCustomerFeatureExists,
} from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════
// Test 1: Different custom prices per plan
//
// Scenario:
// - planA: Pro ($20/mo) with messages — customized to $35/mo
// - planB: Base ($30/mo) with users in group-b — customized to $50/mo
//
// Expected:
// - Preview total = $85 ($35 + $50)
// - Both products active
// - Features correct
// - Invoice total = $85
// ═══════════════════════════════════════════════════════════════════
test.concurrent(`${chalk.yellowBright("multi-attach customize 1: different custom prices per plan")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 500 });
	const usersItem = items.monthlyUsers({ includedUsage: 10 });

	const planA = products.pro({ id: "plan-a", items: [messagesItem] });
	const planB = products.base({
		id: "plan-b",
		items: [usersItem, items.monthlyPrice({ price: 30 })],
		group: "group-b",
	});

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "ma-customize-prices",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [planA, planB] }),
		],
		actions: [],
	});

	const multiAttachParams = {
		customer_id: customerId,
		plans: [
			{
				plan_id: planA.id,
				customize: {
					price: itemsV2.monthlyPrice({ amount: 35 }),
				},
			},
			{
				plan_id: planB.id,
				customize: {
					price: itemsV2.monthlyPrice({ amount: 50 }),
				},
			},
		],
	};

	// 1. Preview — $35 (planA custom) + $50 (planB custom) = $85
	const preview = await autumnV1.billing.previewMultiAttach(multiAttachParams);
	expect(preview.total).toBeCloseTo(85, 0);

	// 2. Attach
	await autumnV1.billing.multiAttach(multiAttachParams);

	// 3. Verify
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [planA.id, planB.id],
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 500,
	});
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Users,
		balance: 10,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 85,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		flags: { checkNotTrialing: true },
	});
});

// ═══════════════════════════════════════════════════════════════════
// Test 2: Custom items per plan (add feature + change included usage)
//
// Scenario:
// - planA: Base ($20/mo) with messages (100 included) —
//   customized to $50/mo, messages (500 included) + dashboard boolean
// - planB: Base ($30/mo) with words (10 included) in group-b —
//   customized to free (price null), words (50 included)
//
// Expected:
// - Preview total = $50 ($50 + $0)
// - Both products active
// - Messages balance = 500, dashboard exists, words balance = 50
// - Invoice total = $50
// ═══════════════════════════════════════════════════════════════════
test.concurrent(`${chalk.yellowBright("multi-attach customize 2: custom items per plan")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const wordsItem = items.monthlyWords({ includedUsage: 10 });

	const planA = products.base({
		id: "plan-a",
		items: [messagesItem, items.monthlyPrice({ price: 20 })],
	});
	const planB = products.base({
		id: "plan-b",
		items: [wordsItem, items.monthlyPrice({ price: 30 })],
		group: "group-b",
	});

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "ma-customize-items",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [planA, planB] }),
		],
		actions: [],
	});

	const multiAttachParams = {
		customer_id: customerId,
		plans: [
			{
				plan_id: planA.id,
				customize: {
					price: {
						amount: 50,
						interval: BillingInterval.Month,
					},
					items: [
						itemsV2.monthlyMessages({ included: 500 }),
						itemsV2.dashboard(),
					],
				},
			},
			{
				plan_id: planB.id,
				customize: {
					price: null,
					items: [itemsV2.monthlyWords({ included: 50 })],
				},
			},
		],
	};

	// 1. Preview — $50 (planA custom price) + $0 (planB price removed) = $50
	const preview = await autumnV1.billing.previewMultiAttach(multiAttachParams);
	expect(preview.total).toEqual(50);

	// 2. Attach
	await autumnV1.billing.multiAttach(multiAttachParams);

	// 3. Verify
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [planA.id, planB.id],
	});

	// Messages: 500 included (customized up from 100)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 500,
	});

	// Dashboard: added via customize items
	await expectCustomerFeatureExists({
		customer,
		featureId: TestFeature.Dashboard,
	});

	// Words: 50 included (customized up from 10)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Words,
		balance: 50,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 50,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		flags: { checkNotTrialing: true },
	});
});
