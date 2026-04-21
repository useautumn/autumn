import { expect, test } from "bun:test";
import type { ApiCustomerV3, AttachParamsV0Input } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectNoStripeSubscription } from "@tests/integration/billing/utils/expectNoStripeSubscription";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService";

test.concurrent(`${chalk.yellowBright("no_billing_changes: attach with no_billing_changes does not create stripe customer")}`, async () => {
	const customerId = "no-billing-changes-no-stripe";
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({ id: "free", items: [messagesItem] });
	const pro = products.pro({ items: [messagesItem] });

	const { autumnV1, ctx } = await initScenario({
		setup: [
			s.deleteCustomer({ customerId }),
			s.products({ list: [free, pro], prefix: customerId }),
		],
		actions: [],
	});

	await autumnV1.customers.create({
		id: customerId,
		name: customerId,
		email: `${customerId}@example.com`,
		internalOptions: { disable_defaults: true },
	});

	await autumnV1.billing.attach<AttachParamsV0Input>({
		customer_id: customerId,
		product_id: free.id,
		no_billing_changes: true,
	});

	await autumnV1.billing.attach<AttachParamsV0Input>({
		customer_id: customerId,
		product_id: pro.id,
		no_billing_changes: true,
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [pro.id],
		notPresent: [free.id],
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 100,
	});

	const dbCustomer = await CusService.get({
		db: ctx.db,
		idOrInternalId: customerId,
		orgId: ctx.org.id,
		env: ctx.env,
	});

	expect(dbCustomer?.processor?.id).toBeUndefined();

	await expectNoStripeSubscription({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});
