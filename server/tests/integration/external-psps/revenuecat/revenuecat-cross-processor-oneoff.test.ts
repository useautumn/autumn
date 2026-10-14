import { expect, test } from "bun:test";
import { AppEnv, customers } from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import { RCMappingService } from "@/external/revenueCat/misc/RCMappingService";
import { OrgService } from "@/internal/orgs/OrgService";
import { encryptData } from "@/utils/encryptUtils";
import {
	expectWebhookSuccess,
	RevenueCatWebhookClient,
} from "./utils/revenue-cat-webhook-client";

const RC_WEBHOOK_SECRET = "test_rc_webhook_secret_xproc";

const setupRevenueCatOrg = async () => {
	if (
		ctx.org.processor_configs?.revenuecat?.sandbox_webhook_secret !==
		RC_WEBHOOK_SECRET
	) {
		await OrgService.update({
			db: ctx.db,
			orgId: ctx.org.id,
			updates: {
				processor_configs: {
					...ctx.org.processor_configs,
					revenuecat: {
						api_key: encryptData("mock_rc_api_key_live"),
						sandbox_api_key: encryptData("mock_rc_api_key_sandbox"),
						project_id: "mock_project_live",
						sandbox_project_id: "mock_project_sandbox",
						webhook_secret: RC_WEBHOOK_SECRET,
						sandbox_webhook_secret: RC_WEBHOOK_SECRET,
					},
				},
			},
		});
	}
};

test.concurrent(
	`${chalk.yellowBright("revenuecat cross-processor 1: stripe sub + rc one-off top-up")}`,
	async () => {
		const customerId = "rc-xproc-1";

		const RC_TOP_UP_ID = "com.app.rc_xproc_top_up_pack";

		const proMonthly = products.pro({
			id: "rc-xproc-pro-monthly",
			items: [items.monthlyMessages({ includedUsage: 1000 })],
		});
		const topUpPack = products.oneOff({
			id: "rc-xproc-top-up-pack",
			items: [items.lifetimeMessages({ includedUsage: 100 })],
			isAddOn: true,
		});

		await setupRevenueCatOrg();

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [proMonthly, topUpPack] }),
			],
			actions: [s.attach({ productId: proMonthly.id })],
		});

		await RCMappingService.upsert({
			db: ctx.db,
			data: {
				org_id: ctx.org.id,
				env: AppEnv.Sandbox,
				autumn_product_id: topUpPack.id,
				revenuecat_product_ids: [RC_TOP_UP_ID],
			},
		});

		const rcClient = new RevenueCatWebhookClient({
			orgId: ctx.org.id,
			env: ctx.env,
			webhookSecret: RC_WEBHOOK_SECRET,
		});

		const dbCustomer = await ctx.db.query.customers.findFirst({
			where: eq(customers.id, customerId),
		});
		expect(dbCustomer).toBeDefined();

		const result = await rcClient.nonRenewingPurchase({
			productId: RC_TOP_UP_ID,
			appUserId: customerId,
			originalTransactionId: "rc_xproc_1_topup_tx_001",
		});

		expectWebhookSuccess(result);

		const customer = await autumnV1.customers.get(customerId);
		expect(customer.products).toHaveLength(2);
		const productIds = customer.products
			.map((p: { id: string }) => p.id)
			.sort();
		expect(productIds).toEqual([proMonthly.id, topUpPack.id].sort());
	},
);

test.concurrent(
	`${chalk.yellowBright("revenuecat cross-processor 2: rc sub + stripe one-off top-up")}`,
	async () => {
		const customerId = "rc-xproc-2";

		const RC_PRO_MONTHLY_ID = "com.app.rc_xproc_pro_monthly";

		const rcProMonthly = products.pro({
			id: "rc-xproc-2-pro-monthly",
			items: [items.monthlyMessages({ includedUsage: 1000 })],
		});
		const webTopUp = products.oneOff({
			id: "rc-xproc-2-web-top-up",
			items: [items.lifetimeMessages({ includedUsage: 100 })],
			isAddOn: true,
		});

		await setupRevenueCatOrg();

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [rcProMonthly, webTopUp] }),
			],
			actions: [],
		});

		await RCMappingService.upsert({
			db: ctx.db,
			data: {
				org_id: ctx.org.id,
				env: AppEnv.Sandbox,
				autumn_product_id: rcProMonthly.id,
				revenuecat_product_ids: [RC_PRO_MONTHLY_ID],
			},
		});

		const rcClient = new RevenueCatWebhookClient({
			orgId: ctx.org.id,
			env: ctx.env,
			webhookSecret: RC_WEBHOOK_SECRET,
		});

		const rcResult = await rcClient.initialPurchase({
			productId: RC_PRO_MONTHLY_ID,
			appUserId: customerId,
			originalTransactionId: "rc_xproc_2_tx_001",
		});
		expectWebhookSuccess(rcResult);

		let customer = await autumnV1.customers.get(customerId);
		expect(customer.products).toHaveLength(1);
		expect(customer.products[0].id).toBe(rcProMonthly.id);

		await autumnV1.attach({
			customer_id: customerId,
			product_id: webTopUp.id,
		});

		customer = await autumnV1.customers.get(customerId);
		expect(customer.products).toHaveLength(2);
		const productIds = customer.products
			.map((p: { id: string }) => p.id)
			.sort();
		expect(productIds).toEqual([rcProMonthly.id, webTopUp.id].sort());
	},
);

test.concurrent(
	`${chalk.yellowBright("revenuecat cross-processor 3: negative guards (recurring still blocked)")}`,
	async () => {
		const customerIdA = "rc-xproc-3a";
		const RC_RECURRING_ID = "com.app.rc_xproc_3a_recurring";

		const stripeProMonthly = products.pro({
			id: "rc-xproc-3a-stripe-pro",
			items: [items.monthlyMessages({ includedUsage: 1000 })],
		});
		const rcRecurring = products.pro({
			id: "rc-xproc-3a-rc-recurring",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		await setupRevenueCatOrg();

		await initScenario({
			customerId: customerIdA,
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [stripeProMonthly, rcRecurring] }),
			],
			actions: [s.attach({ productId: stripeProMonthly.id })],
		});

		await RCMappingService.upsert({
			db: ctx.db,
			data: {
				org_id: ctx.org.id,
				env: AppEnv.Sandbox,
				autumn_product_id: rcRecurring.id,
				revenuecat_product_ids: [RC_RECURRING_ID],
			},
		});

		const rcClient = new RevenueCatWebhookClient({
			orgId: ctx.org.id,
			env: ctx.env,
			webhookSecret: RC_WEBHOOK_SECRET,
		});

		const recurringResult = await rcClient.initialPurchase({
			productId: RC_RECURRING_ID,
			appUserId: customerIdA,
			originalTransactionId: "rc_xproc_3a_tx_001",
		});
		expect(recurringResult.response.status).not.toBe(200);

		const customerIdB = "rc-xproc-3b";
		const RC_PRO_ID_B = "com.app.rc_xproc_3b_pro";

		const rcProB = products.pro({
			id: "rc-xproc-3b-rc-pro",
			items: [items.monthlyMessages({ includedUsage: 1000 })],
		});
		const stripeRecurringAddOn = products.recurringAddOn({
			id: "rc-xproc-3b-recurring-addon",
			items: [items.monthlyMessages({ includedUsage: 50 })],
		});

		const { autumnV1 } = await initScenario({
			customerId: customerIdB,
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [rcProB, stripeRecurringAddOn] }),
			],
			actions: [],
		});

		await RCMappingService.upsert({
			db: ctx.db,
			data: {
				org_id: ctx.org.id,
				env: AppEnv.Sandbox,
				autumn_product_id: rcProB.id,
				revenuecat_product_ids: [RC_PRO_ID_B],
			},
		});

		const rcResult = await rcClient.initialPurchase({
			productId: RC_PRO_ID_B,
			appUserId: customerIdB,
			originalTransactionId: "rc_xproc_3b_tx_001",
		});
		expectWebhookSuccess(rcResult);

		await expect(
			autumnV1.attach({
				customer_id: customerIdB,
				product_id: stripeRecurringAddOn.id,
			}),
		).rejects.toThrow(/Stripe|RevenueCat|external|managed/i);
	},
);

test.concurrent(
	`${chalk.yellowBright("revenuecat cross-processor 4: rc sub + stripe one-off top-up via s.billing.attach (v2)")}`,
	async () => {
		const customerId = "rc-xproc-4";

		const RC_PRO_MONTHLY_ID = "com.app.rc_xproc_4_pro_monthly";

		const rcProMonthly = products.pro({
			id: "rc-xproc-4-pro-monthly",
			items: [items.monthlyMessages({ includedUsage: 1000 })],
		});
		const webTopUp = products.oneOff({
			id: "rc-xproc-4-web-top-up",
			items: [items.lifetimeMessages({ includedUsage: 100 })],
			isAddOn: true,
		});

		await setupRevenueCatOrg();

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [rcProMonthly, webTopUp] }),
			],
			actions: [],
		});

		await RCMappingService.upsert({
			db: ctx.db,
			data: {
				org_id: ctx.org.id,
				env: AppEnv.Sandbox,
				autumn_product_id: rcProMonthly.id,
				revenuecat_product_ids: [RC_PRO_MONTHLY_ID],
			},
		});

		const rcClient = new RevenueCatWebhookClient({
			orgId: ctx.org.id,
			env: ctx.env,
			webhookSecret: RC_WEBHOOK_SECRET,
		});

		const rcResult = await rcClient.initialPurchase({
			productId: RC_PRO_MONTHLY_ID,
			appUserId: customerId,
			originalTransactionId: "rc_xproc_4_tx_001",
		});
		expectWebhookSuccess(rcResult);

		let customer = await autumnV1.customers.get(customerId);
		expect(customer.products).toHaveLength(1);
		expect(customer.products[0].id).toBe(rcProMonthly.id);

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: webTopUp.id,
		});

		customer = await autumnV1.customers.get(customerId);
		expect(customer.products).toHaveLength(2);
		const productIds = customer.products
			.map((p: { id: string }) => p.id)
			.sort();
		expect(productIds).toEqual([rcProMonthly.id, webTopUp.id].sort());
	},
);

test.concurrent(
	`${chalk.yellowBright("revenuecat cross-processor 5: rc sub + stripe recurring add-on via s.billing.attach must throw (v2)")}`,
	async () => {
		const customerId = "rc-xproc-5";

		const RC_PRO_ID = "com.app.rc_xproc_5_pro";

		const rcPro = products.pro({
			id: "rc-xproc-5-rc-pro",
			items: [items.monthlyMessages({ includedUsage: 1000 })],
		});
		const stripeRecurringAddOn = products.recurringAddOn({
			id: "rc-xproc-5-recurring-addon",
			items: [items.monthlyMessages({ includedUsage: 50 })],
		});

		await setupRevenueCatOrg();

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [rcPro, stripeRecurringAddOn] }),
			],
			actions: [],
		});

		await RCMappingService.upsert({
			db: ctx.db,
			data: {
				org_id: ctx.org.id,
				env: AppEnv.Sandbox,
				autumn_product_id: rcPro.id,
				revenuecat_product_ids: [RC_PRO_ID],
			},
		});

		const rcClient = new RevenueCatWebhookClient({
			orgId: ctx.org.id,
			env: ctx.env,
			webhookSecret: RC_WEBHOOK_SECRET,
		});

		const rcResult = await rcClient.initialPurchase({
			productId: RC_PRO_ID,
			appUserId: customerId,
			originalTransactionId: "rc_xproc_5_tx_001",
		});
		expectWebhookSuccess(rcResult);

		await expect(
			autumnV1.billing.attach({
				customer_id: customerId,
				product_id: stripeRecurringAddOn.id,
			}),
		).rejects.toThrow(/Stripe|RevenueCat|external|managed/i);

		const customer = await autumnV1.customers.get(customerId);
		expect(customer.products).toHaveLength(1);
		expect(customer.products[0].id).toBe(rcPro.id);
	},
);
