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
import { WEBHOOK_SETTLE_TIMEOUT_MS } from "@tests/utils/pollableCustomerExpect";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("attach patch customize: add_items/remove_items keep base items")}`, async () => {
	const customerId = "attach-patch-customize-basic";

	const scale = products.base({
		id: "scale",
		items: [
			items.monthlyPrice({ price: 500 }),
			items.monthlyMessages({ includedUsage: 100 }),
			items.adminRights(),
			items.prepaidUsers({ billingUnits: 1 }),
		],
	});

	const { autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [scale] }),
		],
		actions: [],
	});

	const result = await autumnV2_2.billing.attach<AttachParamsV1Input>({
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

	await ctx.stripeCli.invoices.finalizeInvoice(result.invoice!.stripe_id);
	await expectCustomerProducts({
		autumn: autumnV2_2,
		customerId,
		settleTimeoutMs: WEBHOOK_SETTLE_TIMEOUT_MS,
		active: [scale.id],
	});

	const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	await expectProductActive({ customer, productId: scale.id });

	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 100,
		usage: 0,
		planId: scale.id,
	});

	expectFlagCorrect({
		customer,
		featureId: TestFeature.Dashboard,
		planId: scale.id,
	});

	expect(customer.flags?.[TestFeature.AdminRights]).toBeUndefined();

	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Users,
		remaining: 3,
		usage: 0,
		planId: scale.id,
	});
});
