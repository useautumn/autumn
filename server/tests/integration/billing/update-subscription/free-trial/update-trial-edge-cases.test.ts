import { expect, test } from "bun:test";
import { type ApiCustomerV3, FreeTrialDuration, ms } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import {
	expectProductNotTrialing,
	expectProductTrialing,
} from "@tests/integration/billing/utils/expectCustomerProductTrialing";
import { expectPreviewNextCycleCorrect } from "@tests/integration/billing/utils/expectPreviewNextCycleCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { WEBHOOK_SETTLE_TIMEOUT_MS } from "@tests/utils/pollableCustomerExpect";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { addDays, addMonths } from "date-fns";

test.concurrent(`${chalk.yellowBright("trial-edge-cases: start with users, add trial, update quantity, remove trial")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const prepaidUsersItem = items.prepaidUsers({ includedUsage: 0 });

	const pro = products.base({
		id: "pro",
		items: [messagesItem, priceItem, prepaidUsersItem],
	});

	const initialSeats = 3;
	const seatPrice = 10;

	const { customerId, autumnV1, ctx, advancedTo } = await initScenario({
		customerId: "trial-edge-start-users",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({
				productId: pro.id,
				options: [{ feature_id: TestFeature.Users, quantity: initialSeats }],
			}),
		],
	});

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductNotTrialing({
		customer: customerBefore,
		productId: pro.id,
	});

	expectCustomerFeatureCorrect({
		customer: customerBefore,
		featureId: TestFeature.Users,
		includedUsage: initialSeats,
		balance: initialSeats,
		usage: 0,
	});

	const initialTotal = priceItem.price! + initialSeats * seatPrice;
	expectCustomerInvoiceCorrect({
		customer: customerBefore,
		count: 1,
		latestTotal: initialTotal,
	});

	const addTrialParams = {
		customer_id: customerId,
		product_id: pro.id,
		free_trial: {
			length: 14,
			duration: FreeTrialDuration.Day,
			card_required: true,
			unique_fingerprint: false,
		},
	};

	const addTrialPreview =
		await autumnV1.subscriptions.previewUpdate(addTrialParams);

	expect(addTrialPreview.total).toEqual(-initialTotal);

	expectPreviewNextCycleCorrect({
		preview: addTrialPreview,
		startsAt: advancedTo + ms.days(14),
		total: initialTotal,
	});

	await autumnV1.subscriptions.update(addTrialParams);

	const customerWithTrial =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductTrialing({
		customer: customerWithTrial,
		productId: pro.id,
		trialEndsAt: advancedTo + ms.days(14),
	});

	expectCustomerFeatureCorrect({
		customer: customerWithTrial,
		featureId: TestFeature.Users,
		includedUsage: initialSeats,
		balance: initialSeats,
		usage: 0,
	});

	const updatedSeats = 5;
	const updatedSeatsPrice = updatedSeats * seatPrice;

	const updateQuantityParams = {
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Users, quantity: updatedSeats }],
	};

	const updateQuantityPreview =
		await autumnV1.subscriptions.previewUpdate(updateQuantityParams);

	expect(updateQuantityPreview.total).toEqual(0);

	expectPreviewNextCycleCorrect({
		preview: updateQuantityPreview,
		startsAt: advancedTo + ms.days(14),
		total: priceItem.price! + updatedSeatsPrice,
	});

	await autumnV1.subscriptions.update(updateQuantityParams);

	const customerAfterQuantityUpdate =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductTrialing({
		customer: customerAfterQuantityUpdate,
		productId: pro.id,
		trialEndsAt: advancedTo + ms.days(14),
	});

	expectCustomerFeatureCorrect({
		customer: customerAfterQuantityUpdate,
		featureId: TestFeature.Users,
		includedUsage: updatedSeats,
		balance: updatedSeats,
		usage: 0,
	});

	const removeTrialParams = {
		customer_id: customerId,
		product_id: pro.id,
		free_trial: null,
	};

	const removeTrialPreview =
		await autumnV1.subscriptions.previewUpdate(removeTrialParams);

	const finalTotal = priceItem.price! + updatedSeatsPrice;
	expect(removeTrialPreview.total).toEqual(finalTotal - initialTotal);

	expectPreviewNextCycleCorrect({
		preview: removeTrialPreview,
		startsAt: addMonths(advancedTo, 1).getTime(),
		total: finalTotal,
	});

	await autumnV1.subscriptions.update(removeTrialParams, { timeout: 5000 });

	const customerAfterRemove =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductNotTrialing({
		customer: customerAfterRemove,
		productId: pro.id,
	});

	await expectProductActive({
		customer: customerAfterRemove,
		productId: pro.id,
	});

	expectCustomerFeatureCorrect({
		customer: customerAfterRemove,
		featureId: TestFeature.Users,
		includedUsage: updatedSeats,
		balance: updatedSeats,
		usage: 0,
	});

	expectCustomerFeatureCorrect({
		customer: customerAfterRemove,
		featureId: TestFeature.Messages,
		includedUsage: messagesItem.included_usage,
		balance: messagesItem.included_usage,
		usage: 0,
	});

	expectCustomerInvoiceCorrect({
		customer: customerAfterRemove,
		count: 5,
		latestTotal: finalTotal,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		flags: {
			checkNotTrialing: true,
		},
	});
});

test.concurrent(`${chalk.yellowBright("trial-edge-cases: extend trial with longer duration")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 20 });

	const pro = products.base({
		items: [messagesItem, priceItem],
		trialDays: 20,
	});

	const { customerId, autumnV1, ctx, advancedTo } = await initScenario({
		customerId: "trial-edge-extend",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductTrialing({
		customer: customerBefore,
		productId: pro.id,
		trialEndsAt: advancedTo + ms.days(20),
	});

	expectCustomerInvoiceCorrect({
		customer: customerBefore,
		count: 1,
		latestTotal: 0,
	});

	const extendTrialParams = {
		customer_id: customerId,
		product_id: pro.id,
		free_trial: {
			length: 200,
			duration: FreeTrialDuration.Day,
			card_required: true,
			unique_fingerprint: false,
		},
	};

	const extendTrialPreview =
		await autumnV1.subscriptions.previewUpdate(extendTrialParams);

	expect(extendTrialPreview.total).toEqual(0);

	expectPreviewNextCycleCorrect({
		preview: extendTrialPreview,
		startsAt: advancedTo + ms.days(200),
		total: priceItem.price!,
	});

	await autumnV1.subscriptions.update(extendTrialParams, { timeout: 2000 });

	const customerAfterExtend =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductTrialing({
		customer: customerAfterExtend,
		productId: pro.id,
		trialEndsAt: addDays(advancedTo, 200).getTime(),
		toleranceMs: ms.hours(2),
	});

	expectCustomerFeatureCorrect({
		customer: customerAfterExtend,
		featureId: TestFeature.Messages,
		includedUsage: messagesItem.included_usage,
		balance: messagesItem.included_usage,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customerId,
		autumn: autumnV1,
		count: 2,
		latestTotal: 0,
		settleTimeoutMs: WEBHOOK_SETTLE_TIMEOUT_MS,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});
