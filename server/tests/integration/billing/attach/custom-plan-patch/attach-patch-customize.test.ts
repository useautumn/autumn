/**
 * Regression: attach with PATCH-style customize (add_items / remove_items).
 *
 * Red-failure mode (pre-fix):
 *  - setupAttachBillingContext called setupAttachProductContext WITHOUT fullCustomer,
 *    so the patch pipeline (setupAttachPatchProductContext -> setupPatchContext) was
 *    never reached. Patch-style customize fell back to customizePlanV1ToV0, which only
 *    understands PUT-style {price, items} — it dropped EVERY feature item, leaving the
 *    customer on the plan's base price with no entitlements at all.
 *
 * Green-success criteria (post-fix):
 *  - Base items are retained, remove_items are dropped, add_items are present, and
 *    feature_quantities apply — matching multiAttach / createSchedule patch behavior.
 */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	type AttachParamsV1Input,
} from "@autumn/shared";
import {
	expectCustomerProducts,
	expectProductActive,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { expectFlagCorrect } from "@tests/integration/utils/expectFlagCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("attach patch customize: add_items/remove_items keep base items")}`, async () => {
	const customerId = "attach-patch-customize-basic";

	// Mirrors the reported payload: base price + several feature items, a boolean
	// flag to remove, and a prepaid item whose quantity comes from feature_quantities.
	const scale = products.base({
		id: "scale",
		items: [
			items.monthlyPrice({ price: 500 }),
			items.monthlyMessages({ includedUsage: 100 }), // retained canary
			items.adminRights(), // boolean flag to remove
			items.prepaidUsers({ billingUnits: 1 }), // quantity via feature_quantities
		],
	});

	const { autumnV2_2 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [scale] }),
		],
		actions: [],
	});

	await autumnV2_2.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: scale.id,
		customize: {
			add_items: [itemsV2.dashboard()],
			remove_items: [{ feature_id: TestFeature.AdminRights }],
		},
		invoice_mode: { enabled: true, finalize: false },
		feature_quantities: [{ feature_id: TestFeature.Users, quantity: 3 }],
		enable_plan_immediately: true,
	});

	const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);

	// Plan active immediately (enable_plan_immediately overrides invoice-mode deferral).
	await expectProductActive({ customer, productId: scale.id });
	await expectCustomerProducts({ customer, active: [scale.id] });

	// Base feature item retained (the bug dropped this entirely).
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 100,
		usage: 0,
		planId: scale.id,
	});

	// add_items applied.
	expectFlagCorrect({
		customer,
		featureId: TestFeature.Dashboard,
		planId: scale.id,
	});

	// remove_items applied.
	expect(customer.flags?.[TestFeature.AdminRights]).toBeUndefined();

	// feature_quantities applied to the prepaid item.
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Users,
		remaining: 3,
		usage: 0,
		planId: scale.id,
	});
});
