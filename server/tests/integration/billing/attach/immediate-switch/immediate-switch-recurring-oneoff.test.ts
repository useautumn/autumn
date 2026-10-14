import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { expectStripeSubscriptionCorrect } from "../../utils/expectStripeSubCorrect";

test.concurrent(
	`${chalk.yellowBright("immediate-switch-recurring-oneoff 1: free to pro")}`,
	async () => {
		const customerId = "imm-switch-ro-free-to-pro";
		const basePrice = 20;
		const wordsPricePerPack = 15;
		const messagesPricePerPack = 10;
		const billingUnits = 100;

		const freeMessagesItem = items.monthlyMessages({ includedUsage: 50 });
		const free = products.base({ id: "free", items: [freeMessagesItem] });

		const monthlyWordsItem = items.prepaid({
			featureId: TestFeature.Words,
			includedUsage: 0,
			billingUnits,
			price: wordsPricePerPack,
		});
		const oneOffMessagesItem = items.oneOffMessages({
			includedUsage: 0,
			billingUnits,
			price: messagesPricePerPack,
		});
		const pro = products.pro({
			id: "pro-mixed",
			items: [monthlyWordsItem, oneOffMessagesItem],
		});

		const { autumnV1, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [free, pro] }),
			],
			actions: [s.billing.attach({ productId: free.id })],
		});

		const customerBefore =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerProducts({
			customer: customerBefore,
			active: [free.id],
		});

		const wordsQuantity = 100;
		const messagesQuantity = 100;
		const expectedTotal = basePrice + wordsPricePerPack + messagesPricePerPack;
		const preview = await autumnV1.billing.previewAttach({
			customer_id: customerId,
			product_id: pro.id,
			options: [
				{ feature_id: TestFeature.Words, quantity: wordsQuantity },
				{ feature_id: TestFeature.Messages, quantity: messagesQuantity },
			],
		});
		expect(preview.total).toBe(expectedTotal);

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: pro.id,
			options: [
				{ feature_id: TestFeature.Words, quantity: wordsQuantity },
				{ feature_id: TestFeature.Messages, quantity: messagesQuantity },
			],
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectCustomerProducts({
			customer,
			active: [pro.id],
			notPresent: [free.id],
		});

		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Words,
			balance: wordsQuantity,
			usage: 0,
		});

		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Messages,
			balance: messagesQuantity,
			usage: 0,
		});

		await expectCustomerInvoiceCorrect({
			customer,
			count: 1,
			latestTotal: expectedTotal,
		});

		await expectStripeSubscriptionCorrect({
			ctx,
			customerId,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("immediate-switch-recurring-oneoff 2: pro to premium")}`,
	async () => {
		const customerId = "imm-switch-ro-pro-to-premium";
		const proPrice = 20;
		const premiumPrice = 50;
		const wordsPricePerPack = 15;
		const storagePricePerPack = 10;
		const billingUnits = 100;

		const proMessagesItem = items.monthlyMessages({ includedUsage: 100 });
		const pro = products.pro({ id: "pro", items: [proMessagesItem] });

		const monthlyWordsItem = items.prepaid({
			featureId: TestFeature.Words,
			includedUsage: 0,
			billingUnits,
			price: wordsPricePerPack,
		});
		const oneOffStorageItem = items.oneOffStorage({
			includedUsage: 0,
			billingUnits,
			price: storagePricePerPack,
		});
		const premium = products.premium({
			id: "premium-mixed",
			items: [monthlyWordsItem, oneOffStorageItem],
		});

		const { autumnV1, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		const customerBefore =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerProducts({
			customer: customerBefore,
			active: [pro.id],
		});

		const wordsQuantity = 100;
		const storageQuantity = 100;
		const proratedBase = premiumPrice - proPrice;
		const expectedTotal =
			proratedBase + wordsPricePerPack + storagePricePerPack;
		const preview = await autumnV1.billing.previewAttach({
			customer_id: customerId,
			product_id: premium.id,
			options: [
				{ feature_id: TestFeature.Words, quantity: wordsQuantity },
				{ feature_id: TestFeature.Storage, quantity: storageQuantity },
			],
		});
		expect(preview.total).toBe(expectedTotal);

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: premium.id,
			options: [
				{ feature_id: TestFeature.Words, quantity: wordsQuantity },
				{ feature_id: TestFeature.Storage, quantity: storageQuantity },
			],
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectCustomerProducts({
			customer,
			active: [premium.id],
			notPresent: [pro.id],
		});

		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Words,
			balance: wordsQuantity,
			usage: 0,
		});

		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Storage,
			balance: storageQuantity,
			usage: 0,
		});

		await expectCustomerInvoiceCorrect({
			customer,
			count: 2,
			latestTotal: expectedTotal,
		});

		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("immediate-switch-recurring-oneoff 3: one-off balance preserved on upgrade")}`,
	async () => {
		const customerId = "imm-switch-ro-oneoff-lost";
		const proPrice = 20;
		const premiumPrice = 50;
		const messagesPricePerPack = 10;
		const billingUnits = 100;

		const oneOffMessagesItem = items.oneOffMessages({
			includedUsage: 0,
			billingUnits,
			price: messagesPricePerPack,
		});
		const pro = products.pro({
			id: "pro-with-oneoff",
			items: [oneOffMessagesItem],
		});

		const premiumMessagesItem = items.monthlyMessages({ includedUsage: 500 });
		const premium = products.premium({
			id: "premium-recurring-only",
			items: [premiumMessagesItem],
		});

		const { autumnV1, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [
				s.billing.attach({
					productId: pro.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
				}),
			],
		});

		const customerBefore =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerProducts({
			customer: customerBefore,
			active: [pro.id],
		});
		expectCustomerFeatureCorrect({
			customer: customerBefore,
			featureId: TestFeature.Messages,
			balance: 100,
			usage: 0,
		});

		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 50,
		});

		const customerAfterUsage =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expectCustomerFeatureCorrect({
			customer: customerAfterUsage,
			featureId: TestFeature.Messages,
			balance: 50,
			usage: 50,
		});

		const proratedBase = premiumPrice - proPrice;
		const expectedTotal = proratedBase;

		const preview = await autumnV1.billing.previewAttach({
			customer_id: customerId,
			product_id: premium.id,
		});
		expect(preview.total).toBe(expectedTotal);

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: premium.id,
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectCustomerProducts({
			customer,
			active: [premium.id],
			notPresent: [pro.id],
		});

		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Messages,
			includedUsage: 550,
			balance: 550,
			usage: 0,
		});

		await expectCustomerInvoiceCorrect({
			customer,
			count: 2,
			latestTotal: expectedTotal,
		});

		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("immediate-switch-recurring-oneoff 4: upgrade no options, one-off not charged")}`,
	async () => {
		const customerId = "imm-switch-ro-no-opts";
		const proPrice = 20;
		const premiumPrice = 50;
		const billingUnits = 100;

		const proMessagesItem = items.monthlyMessages({ includedUsage: 100 });
		const pro = products.pro({ id: "pro", items: [proMessagesItem] });

		const oneOffMessagesItem = items.oneOffMessages({
			includedUsage: 0,
			billingUnits,
			price: 10,
		});
		const premium = products.premium({
			id: "premium-mixed",
			items: [oneOffMessagesItem],
		});

		const { autumnV1, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		const customerBefore =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerProducts({
			customer: customerBefore,
			active: [pro.id],
		});

		const proratedBase = premiumPrice - proPrice;
		const preview = await autumnV1.billing.previewAttach({
			customer_id: customerId,
			product_id: premium.id,
		});
		expect(preview.total).toBe(proratedBase);

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: premium.id,
			redirect_mode: "if_required",
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectCustomerProducts({
			customer,
			active: [premium.id],
			notPresent: [pro.id],
		});

		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Messages,
			balance: 0,
			usage: 0,
		});

		await expectCustomerInvoiceCorrect({
			customer,
			count: 2,
			latestTotal: proratedBase,
		});

		await expectStripeSubscriptionCorrect({
			ctx,
			customerId,
		});
	},
);
