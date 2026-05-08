/**
 * TDD coverage for patch-style updates combined with other update params.
 *
 * Contract under test:
 *   New behaviors:
 *     - Patch customizations compose with adding and removing free trials, including
 *       correct preview totals, next_cycle previews, and final invoices.
 *     - Patch customizations while updating product version create a new customer
 *       product and apply the patch to that new version snapshot.
 *     - Patch customizations can update a canceling product without clearing its
 *       canceling state, and the patched state survives uncancel.
 *     - PUT-style custom update followed by PATCH-style custom update leaves the
 *       final plan state correct.
 *   Side effects:
 *     - Existing-mode patch updates do not expire or replace the customer product.
 *     - New-version patch updates do expire the original customer product.
 *     - Stripe subscription state stays consistent with the patched customer product.
 *
 * Pre-impl red: patchContext may not compose with trial, version, canceling, or
 * post-PUT update flows.
 * Post-impl green: setup derives the right patch mode/context and compute/execute
 * apply the patch through the same billing plan path as normal updates.
 */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	type ApiCustomerV5,
	CusProductStatus,
	FreeTrialDuration,
	ms,
	type UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectCustomerProducts,
	expectProductActive,
	expectProductCanceling,
	expectProductScheduled,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import {
	expectProductNotTrialing,
	expectProductTrialing,
} from "@tests/integration/billing/utils/expectCustomerProductTrialing";
import { expectNoExpiredCustomerProducts } from "@tests/integration/billing/utils/expectNoExpiredCustomerProducts";
import { expectPreviewNextCycleCorrect } from "@tests/integration/billing/utils/expectPreviewNextCycleCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { expectFlagCorrect } from "@tests/integration/utils/expectFlagCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService";

const expectExpiredCustomerProductCount = async ({
	ctx,
	customerId,
	productId,
	count,
}: {
	ctx: Parameters<typeof CusService.getFull>[0]["ctx"];
	customerId: string;
	productId: string;
	count: number;
}) => {
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
		inStatuses: [
			CusProductStatus.Active,
			CusProductStatus.PastDue,
			CusProductStatus.Scheduled,
			CusProductStatus.Expired,
		],
		withEntities: true,
	});

	const expiredCustomerProducts = fullCustomer.customer_products.filter(
		(customerProduct) =>
			customerProduct.product_id === productId &&
			customerProduct.status === CusProductStatus.Expired,
	);

	expect(expiredCustomerProducts.length).toBe(count);
};

test.concurrent(`${chalk.yellowBright("patch with others: add trial and patch item")}`, async () => {
	const customerId = "patch-with-others-add-trial";
	const pro = products.pro({
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const { autumnV1, autumnV2_2, ctx, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	const updateParams: UpdateSubscriptionV1ParamsInput = {
		customer_id: customerId,
		plan_id: pro.id,
		customize: {
			free_trial: {
				duration_length: 14,
				duration_type: FreeTrialDuration.Day,
				card_required: true,
			},
			add_items: [itemsV2.dashboard()],
		},
	};

	const preview =
		await autumnV2_2.subscriptions.previewUpdate<UpdateSubscriptionV1ParamsInput>(
			updateParams,
		);
	expect(preview.total).toBe(-20);
	expectPreviewNextCycleCorrect({
		preview,
		startsAt: advancedTo + ms.days(14),
		total: 20,
	});

	await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>(
		updateParams,
	);

	const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	await expectCustomerProducts({ customer, active: [pro.id] });
	await expectProductTrialing({
		customer,
		productId: pro.id,
		trialEndsAt: advancedTo + ms.days(14),
	});
	expectFlagCorrect({
		customer,
		featureId: TestFeature.Dashboard,
		planId: pro.id,
	});
	await expectCustomerInvoiceCorrect({
		customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
		count: 2,
		latestTotal: preview.total,
	});
	await expectNoExpiredCustomerProducts({ ctx, customerId, productId: pro.id });
	await expectStripeSubscriptionCorrect({ ctx, customerId });
});

test.concurrent(`${chalk.yellowBright("patch with others: remove trial and patch item")}`, async () => {
	const customerId = "patch-with-others-remove-trial";
	const pro = products.proWithTrial({
		items: [items.monthlyMessages({ includedUsage: 100 })],
		trialDays: 7,
	});

	const { autumnV1, autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	const updateParams: UpdateSubscriptionV1ParamsInput = {
		customer_id: customerId,
		plan_id: pro.id,
		customize: {
			free_trial: null,
			add_items: [itemsV2.dashboard()],
		},
	};

	const preview =
		await autumnV2_2.subscriptions.previewUpdate<UpdateSubscriptionV1ParamsInput>(
			updateParams,
		);
	expect(preview.total).toBe(20);
	expectPreviewNextCycleCorrect({ preview, expectDefined: false });

	await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>(
		updateParams,
	);

	const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	await expectCustomerProducts({ customer, active: [pro.id] });
	await expectProductNotTrialing({ customer, productId: pro.id });
	expectFlagCorrect({
		customer,
		featureId: TestFeature.Dashboard,
		planId: pro.id,
	});
	await expectCustomerInvoiceCorrect({
		customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
		count: 2,
		latestTotal: preview.total,
	});
	await expectNoExpiredCustomerProducts({ ctx, customerId, productId: pro.id });
	await expectStripeSubscriptionCorrect({ ctx, customerId });
});

test.concurrent(`${chalk.yellowBright("patch with others: version update creates new patched customer product")}`, async () => {
	const customerId = "patch-with-others-version";
	const pro = products.base({
		id: "pro",
		items: [
			items.monthlyMessages({ includedUsage: 100 }),
			items.monthlyPrice({ price: 20 }),
		],
	});

	const { autumnV1, autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	await autumnV1.products.update(pro.id, {
		items: [
			items.monthlyMessages({ includedUsage: 100 }),
			items.monthlyPrice({ price: 30 }),
		],
	});

	const updateParams: UpdateSubscriptionV1ParamsInput = {
		customer_id: customerId,
		plan_id: pro.id,
		version: 2,
		customize: {
			remove_items: [{ feature_id: TestFeature.Messages }],
			add_items: [itemsV2.dashboard(), itemsV2.monthlyWords({ included: 150 })],
		},
	};

	const preview =
		await autumnV2_2.subscriptions.previewUpdate<UpdateSubscriptionV1ParamsInput>(
			updateParams,
		);
	expect(preview.total).toBe(10);

	await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>(
		updateParams,
	);

	const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	await expectCustomerProducts({ customer, active: [pro.id] });
	expect(customer.balances[TestFeature.Messages]).toBeUndefined();
	expectFlagCorrect({
		customer,
		featureId: TestFeature.Dashboard,
		planId: pro.id,
	});
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Words,
		remaining: 150,
		usage: 0,
		planId: pro.id,
	});
	await expectCustomerInvoiceCorrect({
		customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
		count: 2,
		latestTotal: preview.total,
	});
	await expectExpiredCustomerProductCount({
		ctx,
		customerId,
		productId: pro.id,
		count: 1,
	});
	await expectStripeSubscriptionCorrect({ ctx, customerId });
});

test.concurrent(`${chalk.yellowBright("patch with others: patch while canceling then uncancel")}`, async () => {
	const customerId = "patch-with-others-canceling";
	const free = products.base({
		id: "free",
		items: [],
		isDefault: true,
	});
	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const { autumnV1, autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, pro] }),
		],
		actions: [
			s.billing.attach({ productId: pro.id }),
			s.cancel({ productId: pro.id }),
		],
	});

	const patchParams: UpdateSubscriptionV1ParamsInput = {
		customer_id: customerId,
		plan_id: pro.id,
		customize: {
			add_items: [itemsV2.dashboard()],
		},
	};

	const preview =
		await autumnV2_2.subscriptions.previewUpdate<UpdateSubscriptionV1ParamsInput>(
			patchParams,
		);
	expect(preview.total).toBe(0);

	await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>(
		patchParams,
	);

	const customerAfterPatch =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductCanceling({
		customer: customerAfterPatch,
		productId: pro.id,
	});
	await expectProductScheduled({
		customer: customerAfterPatch,
		productId: free.id,
	});

	await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
		customer_id: customerId,
		plan_id: pro.id,
		cancel_action: "uncancel",
	});

	const customerAfterUncancel =
		await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	await expectProductActive({
		customer: customerAfterUncancel,
		productId: pro.id,
	});
	expectFlagCorrect({
		customer: customerAfterUncancel,
		featureId: TestFeature.Dashboard,
		planId: pro.id,
	});
	await expectNoExpiredCustomerProducts({ ctx, customerId, productId: pro.id });
	await expectStripeSubscriptionCorrect({ ctx, customerId });
});

test.concurrent(`${chalk.yellowBright("patch with others: put update then patch update")}`, async () => {
	const customerId = "patch-with-others-put-then-patch";
	const pro = products.pro({
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const { autumnV1, autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	const putParams: UpdateSubscriptionV1ParamsInput = {
		customer_id: customerId,
		plan_id: pro.id,
		customize: {
			price: itemsV2.monthlyPrice({ amount: 25 }),
			items: [itemsV2.monthlyWords({ included: 120 })],
		},
	};
	const putPreview =
		await autumnV2_2.subscriptions.previewUpdate<UpdateSubscriptionV1ParamsInput>(
			putParams,
		);
	expect(putPreview.total).toBe(5);
	await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>(
		putParams,
	);

	const patchParams: UpdateSubscriptionV1ParamsInput = {
		customer_id: customerId,
		plan_id: pro.id,
		customize: {
			remove_items: [{ feature_id: TestFeature.Words }],
			add_items: [
				itemsV2.dashboard(),
				itemsV2.monthlyMessages({ included: 200 }),
			],
		},
	};
	const patchPreview =
		await autumnV2_2.subscriptions.previewUpdate<UpdateSubscriptionV1ParamsInput>(
			patchParams,
		);
	expect(patchPreview.total).toBe(0);
	await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>(
		patchParams,
	);

	const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	expect(customer.balances[TestFeature.Words]).toBeUndefined();
	expectFlagCorrect({
		customer,
		featureId: TestFeature.Dashboard,
		planId: pro.id,
	});
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 200,
		usage: 0,
		planId: pro.id,
	});
	await expectCustomerInvoiceCorrect({
		customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
		count: 2,
		latestTotal: putPreview.total,
	});
	await expectNoExpiredCustomerProducts({ ctx, customerId, productId: pro.id });
	await expectStripeSubscriptionCorrect({ ctx, customerId });
});
