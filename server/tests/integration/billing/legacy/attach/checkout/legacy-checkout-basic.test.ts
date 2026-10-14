import { expect, test } from "bun:test";
import type {
	ApiCustomerV1,
	ApiCustomerV3,
	CheckResponseV0,
} from "@autumn/shared";
import { AutumnCli } from "@tests/cli/AutumnCli";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { completeStripeCheckoutFormV2 } from "@tests/utils/browserPool/completeStripeCheckoutFormV2";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { WEBHOOK_SETTLE_TIMEOUT_MS } from "@tests/utils/pollableCustomerExpect";
import {
	checkoutSessionIdFromUrl,
	waitForStripeWebhook,
} from "@tests/utils/stripeUtils/waitForStripeWebhook";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("legacy-checkout 1: basic stripe checkout")}`,
	async () => {
		const customerId = "legacy-checkout-1";

		const dashboardItem = items.dashboard();
		const messagesItem = items.monthlyMessages({ includedUsage: 10 });
		const adminItem = items.adminRights();
		const pro = products.pro({
			id: "pro",
			items: [dashboardItem, messagesItem, adminItem],
		});

		const { autumnV1, ctx } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: true }), s.products({ list: [pro] })],
			actions: [],
		});

		const { checkout_url } = await autumnV1.attach({
			customer_id: customerId,
			product_id: pro.id,
		});

		await completeStripeCheckoutFormV2({ url: checkout_url });

		await waitForStripeWebhook({
			stripeCli: ctx.stripeCli,
			env: ctx.env,
			types: ["checkout.session.completed"],
			objectId: checkoutSessionIdFromUrl(checkout_url),
			until: async () => {
				const customer =
					await autumnV1.customers.get<ApiCustomerV3>(customerId);
				return (customer.products ?? []).some(
					(product: { id?: string }) => product.id === pro.id,
				);
			},
		});

		await expectCustomerProducts({
			autumn: autumnV1,
			customerId,
			settleTimeoutMs: WEBHOOK_SETTLE_TIMEOUT_MS,
			active: [pro.id],
		});

		await expectCustomerInvoiceCorrect({
			autumn: autumnV1,
			customerId,
			count: 1,
			latestTotal: 20,
		});

		const dashboardCheck = (await AutumnCli.entitled(
			customerId,
			TestFeature.Dashboard,
		)) as CheckResponseV0;
		expect(dashboardCheck.allowed).toBe(true);

		const messagesCheck = (await AutumnCli.entitled(
			customerId,
			TestFeature.Messages,
		)) as CheckResponseV0;
		expect(messagesCheck.allowed).toBe(true);
		const messagesBalance = messagesCheck.balances.find(
			(b) => b.feature_id === TestFeature.Messages,
		);
		expect(messagesBalance?.balance).toBe(10);

		const adminCheck = (await AutumnCli.entitled(
			customerId,
			TestFeature.AdminRights,
		)) as CheckResponseV0;
		expect(adminCheck.allowed).toBe(true);
	},
);

test.concurrent(
	`${chalk.yellowBright("legacy-checkout 2: one-time add-on via force_checkout")}`,
	async () => {
		const customerId = "legacy-checkout-2";
		const oneTimeQuantity = 500;
		const oneTimeBillingUnits = 250;
		const oneTimePurchaseCount = 2;

		const dashboardItem = items.dashboard();
		const messagesItem = items.monthlyMessages({ includedUsage: 10 });
		const adminItem = items.adminRights();
		const pro = products.pro({
			id: "pro",
			items: [dashboardItem, messagesItem, adminItem],
		});

		const oneOffItem = items.oneOffMessages({
			price: 9,
			billingUnits: oneTimeBillingUnits,
			includedUsage: 0,
		});
		const oneOff = products.oneOffAddOn({
			id: "one_off",
			items: [oneOffItem],
		});

		const { autumnV1, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: true }),
				s.products({ list: [pro, oneOff] }),
			],
			actions: [s.attach({ productId: pro.id })],
		});

		for (let i = 0; i < oneTimePurchaseCount; i++) {
			const res = await autumnV1.attach({
				customer_id: customerId,
				product_id: oneOff.id,
				force_checkout: true,
			});

			await completeStripeCheckoutFormV2({
				url: res.checkout_url,
				overrideQuantity: oneTimeQuantity / oneTimeBillingUnits,
			});

			const purchasesSoFar = i + 1;
			await waitForStripeWebhook({
				stripeCli: ctx.stripeCli,
				env: ctx.env,
				types: ["checkout.session.completed"],
				objectId: checkoutSessionIdFromUrl(res.checkout_url),
				until: async () => {
					const customer = (await AutumnCli.getCustomer(
						customerId,
					)) as ApiCustomerV1;
					const addOn = customer.entitlements.find(
						(entitlement) =>
							entitlement.feature_id === TestFeature.Messages &&
							entitlement.interval === "lifetime",
					);
					return (addOn?.balance ?? 0) >= oneTimeQuantity * purchasesSoFar;
				},
			});
		}

		const cusRes = (await AutumnCli.getCustomer(customerId)) as ApiCustomerV1;

		const addOnBalance = cusRes.entitlements.find(
			(e) => e.feature_id === TestFeature.Messages && e.interval === "lifetime",
		);
		const expectedAddOnBalance = oneTimeQuantity * oneTimePurchaseCount;
		expect(addOnBalance?.balance).toBe(expectedAddOnBalance);

		expect(cusRes.add_ons).toHaveLength(1);
		expect(cusRes.add_ons[0].id).toBe(oneOff.id);
		expect(cusRes.invoices.length).toBe(1 + oneTimePurchaseCount);

		const res = (await AutumnCli.entitled(
			customerId,
			TestFeature.Messages,
		)) as CheckResponseV0;
		expect(res.allowed).toBe(true);

		const proMeteredAmt = 10;
		const messagesBalance = res.balances.find(
			(b) => b.feature_id === TestFeature.Messages,
		);
		expect(messagesBalance?.balance).toBe(proMeteredAmt + expectedAddOnBalance);
	},
);

test.concurrent(
	`${chalk.yellowBright("legacy-checkout 3: multi-product checkout")}`,
	async () => {
		const customerId = "legacy-checkout-3";

		const messagesItem = items.monthlyMessages({ includedUsage: 100 });
		const pro = products.pro({
			id: "pro",
			items: [messagesItem],
		});

		const usersItem = items.monthlyUsers({ includedUsage: 5 });
		const oneOff = products.oneOffAddOn({
			id: "one_off",
			items: [usersItem],
		});

		const { autumnV1, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: true }),
				s.products({ list: [pro, oneOff] }),
			],
			actions: [],
		});

		const res = await autumnV1.attach({
			customer_id: customerId,
			product_ids: [pro.id, oneOff.id],
		});

		await completeStripeCheckoutFormV2({ url: res.checkout_url });

		await waitForStripeWebhook({
			stripeCli: ctx.stripeCli,
			env: ctx.env,
			types: ["checkout.session.completed"],
			objectId: checkoutSessionIdFromUrl(res.checkout_url),
			until: async () => {
				const customer =
					await autumnV1.customers.get<ApiCustomerV3>(customerId);
				const productIds = (customer.products ?? []).map(
					(product: { id?: string }) => product.id,
				);
				return [pro.id, oneOff.id].every((id) => productIds.includes(id));
			},
		});

		await expectCustomerProducts({
			autumn: autumnV1,
			customerId,
			settleTimeoutMs: WEBHOOK_SETTLE_TIMEOUT_MS,
			active: [pro.id, oneOff.id],
		});

		await expectCustomerInvoiceCorrect({
			autumn: autumnV1,
			customerId,
			count: 1,
			latestTotal: 30,
			latestInvoiceProductIds: [pro.id, oneOff.id],
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Messages,
			balance: 100,
			usage: 0,
		});

		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Users,
			balance: 5,
			usage: 0,
		});
	},
);
