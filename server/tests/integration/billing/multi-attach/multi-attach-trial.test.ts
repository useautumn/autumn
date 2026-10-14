import type { MultiAttachParamsV0Input } from "@shared/api/billing/attachV2/multiAttachParamsV0";

import { expect, test } from "bun:test";
import {
	ALL_STATUSES,
	type ApiCustomerV3,
	CusProductStatus,
	FreeTrialDuration,
	ms,
} from "@autumn/shared";
import {
	expectCustomerFeatureCorrect,
	expectCustomerFeatureExists,
} from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import {
	expectProductNotTrialing,
	expectProductTrialing,
} from "@tests/integration/billing/utils/expectCustomerProductTrialing";
import { waitForInvoiceLineItems } from "@tests/integration/billing/utils/expectInvoiceLineItemsCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService";

test.concurrent(`${chalk.yellowBright("multi-attach trial 1: trial inherited from recurring product")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 500 });
	const dashboardItem = items.dashboard();

	const proTrial = products.proWithTrial({
		id: "pro-trial",
		items: [messagesItem],
		trialDays: 7,
		cardRequired: true,
	});
	const addon = products.oneOffAddOn({
		id: "addon",
		items: [dashboardItem],
	});

	const { customerId, autumnV1, ctx, advancedTo } = await initScenario({
		customerId: "ma-trial-inherit",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proTrial, addon] }),
		],
		actions: [],
	});

	const multiAttachParams = {
		customer_id: customerId,
		plans: [{ plan_id: proTrial.id }, { plan_id: addon.id }],
	};

	const preview = await autumnV1.billing.previewMultiAttach(multiAttachParams);
	expect(preview.total).toBeCloseTo(10, 0);

	await autumnV1.billing.multiAttach(multiAttachParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [proTrial.id, addon.id],
	});

	await expectProductTrialing({
		customer,
		productId: proTrial.id,
		trialEndsAt: advancedTo + ms.days(7),
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 500,
	});

	await expectCustomerFeatureExists({
		customer,
		featureId: TestFeature.Dashboard,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	const invoice = customer.invoices?.[0];
	expect(invoice?.stripe_id).toBeDefined();
	const lineItems = await waitForInvoiceLineItems({
		stripeInvoiceId: invoice!.stripe_id,
	});
	const trialLineItems = lineItems.filter(
		(lineItem) =>
			lineItem.amount === 0 && lineItem.stripe_subscription_item_id !== null,
	);
	expect(trialLineItems).toHaveLength(1);
	expect(trialLineItems[0].product_id).toBe(proTrial.id);
});

test.concurrent(
	`${chalk.yellowBright("multi-attach trial 4: revert trial pauses and links multiple replaced plans")}`,
	async () => {
		const existingA = products.base({
			id: "revert-existing-a",
			items: [items.monthlyPrice({ price: 10 })],
		});
		const existingB = products.base({
			id: "revert-existing-b",
			items: [items.monthlyPrice({ price: 20 })],
			group: "revert-group-b",
		});
		const replacementA = products.base({
			id: "revert-replacement-a",
			items: [items.monthlyPrice({ price: 30 })],
		});
		const replacementB = products.base({
			id: "revert-replacement-b",
			items: [items.monthlyPrice({ price: 40 })],
			group: "revert-group-b",
		});
		const { autumnV1, autumnV2_2, customerId, ctx, advancedTo } =
			await initScenario({
				customerId: "ma-trial-revert-multiple",
				setup: [
					s.customer({ paymentMethod: "success" }),
					s.products({
						list: [existingA, existingB, replacementA, replacementB],
					}),
				],
				actions: [
					s.billing.attach({ productId: existingA.id }),
					s.billing.attach({ productId: existingB.id }),
				],
			});

		await autumnV2_2.billing.multiAttach({
			customer_id: customerId,
			plans: [{ plan_id: replacementA.id }, { plan_id: replacementB.id }],
			free_trial: {
				duration_length: 14,
				duration_type: FreeTrialDuration.Day,
				card_required: false,
				on_end: "revert",
			},
		});

		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			inStatuses: ALL_STATUSES,
		});
		const byProductId = new Map(
			fullCustomer.customer_products.map((customerProduct) => [
				customerProduct.product_id,
				customerProduct,
			]),
		);

		for (const [existing, replacement] of [
			[existingA, replacementA],
			[existingB, replacementB],
		] as const) {
			const paused = byProductId.get(existing.id);
			const trial = byProductId.get(replacement.id);

			expect(paused?.status).toBe(CusProductStatus.Paused);
			expect(paused?.canceled).toBe(false);
			expect(paused?.ended_at).toBeNull();
			expect(trial?.previous_customer_product_id).toBe(paused?.id);
			expect(trial?.on_trial_end).toBe("revert");
			expect(trial?.trial_ends_at).toBeWithin(
				advancedTo + ms.days(14) - ms.hours(1),
				advancedTo + ms.days(14) + ms.hours(1),
			);
		}

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerInvoiceCorrect({
			customer,
			count: 2,
			latestTotal: 20,
		});
	},
);

test.concurrent(`${chalk.yellowBright("multi-attach trial 2: free_trial null suppresses product trial")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 500 });
	const dashboardItem = items.dashboard();

	const proTrial = products.proWithTrial({
		id: "pro-trial",
		items: [messagesItem],
		trialDays: 7,
		cardRequired: true,
	});
	const addon = products.oneOffAddOn({
		id: "addon",
		items: [dashboardItem],
	});

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "ma-trial-null",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proTrial, addon] }),
		],
		actions: [],
	});

	const multiAttachParams = {
		customer_id: customerId,
		plans: [{ plan_id: proTrial.id }, { plan_id: addon.id }],
		free_trial: null,
	};

	const preview = await autumnV1.billing.previewMultiAttach(multiAttachParams);
	expect(preview.total).toBeCloseTo(30, 0);

	await autumnV1.billing.multiAttach(multiAttachParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [proTrial.id, addon.id],
	});

	await expectProductNotTrialing({
		customer,
		productId: proTrial.id,
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 500,
	});

	await expectCustomerFeatureExists({
		customer,
		featureId: TestFeature.Dashboard,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 30,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		flags: { checkNotTrialing: true },
	});
});

test.concurrent(`${chalk.yellowBright("multi-attach trial 3: explicit free_trial param applies trial")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 300 });
	const dashboardItem = items.dashboard();

	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});
	const addon = products.oneOffAddOn({
		id: "addon",
		items: [dashboardItem],
	});

	const { customerId, autumnV1, ctx, advancedTo } = await initScenario({
		customerId: "ma-trial-explicit",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, addon] }),
		],
		actions: [],
	});

	const multiAttachParams: MultiAttachParamsV0Input = {
		customer_id: customerId,
		plans: [{ plan_id: pro.id }, { plan_id: addon.id }],
		free_trial: {
			duration_length: 14,
			duration_type: FreeTrialDuration.Day,
		},
	};

	const preview = await autumnV1.billing.previewMultiAttach(multiAttachParams);
	expect(preview.total).toBeCloseTo(10, 0);

	await autumnV1.billing.multiAttach(multiAttachParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [pro.id, addon.id],
	});

	await expectProductTrialing({
		customer,
		productId: pro.id,
		trialEndsAt: advancedTo + ms.days(14),
		toleranceMs: ms.hours(1) + ms.minutes(10),
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 300,
	});

	await expectCustomerFeatureExists({
		customer,
		featureId: TestFeature.Dashboard,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});
