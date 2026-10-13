/**
 * A prepaid quantity downgrade scheduled for the next cycle must show in the
 * customer's upcoming invoice preview, exactly as Stripe will bill it.
 *
 * Red (before):  the preview kept only plans on the Stripe subscription, so the
 *                scheduled downgrade (linked only to the schedule) was dropped and the
 *                upcoming invoice previewed $0 with no plans.
 * Green (after): the preview includes plans on the subscription's schedule, so it
 *                bills the downgraded quantity and matches Stripe's upcoming invoice.
 *                Another subscription's scheduled plans and unlinked free plans stay out.
 */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	type ApiInvoicePreviewV0,
	type AttachParamsV0Input,
	type CreateScheduleParamsV0Input,
	CustomerExpand,
	customerProductsToStripeSubscriptionIds,
	ms,
	type SetPlansParamsV0Input,
	timestampsMatch,
} from "@autumn/shared";
import { expectStripeUpcomingInvoiceCorrect } from "@tests/integration/billing/set-plans/utils/subscriptionStateUtils";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { addMonths } from "date-fns";
import { CusService } from "@/internal/customers/CusService.js";

const UPGRADED_QUANTITY = 500;
const DOWNGRADED_QUANTITY = 200;
// prepaidMessages bills $10 per 100 messages.
const DOWNGRADED_TOTAL = 20;

const setupPrepaidUpgrade = async ({ customerId }: { customerId: string }) => {
	const prepaid = products.base({
		id: `${customerId}-prepaid`,
		items: [items.prepaidMessages()],
	});

	const scenario = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [prepaid] }),
		],
		actions: [
			s.billing.attach({
				productId: prepaid.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: UPGRADED_QUANTITY },
				],
			}),
		],
	});

	const downgradeAt = addMonths(scenario.advancedTo, 1).getTime();
	const downgradePhases: SetPlansParamsV0Input["phases"] = [
		{
			starts_at: "now",
			plans: [
				{
					plan_id: prepaid.id,
					feature_quantities: [
						{ feature_id: TestFeature.Messages, quantity: UPGRADED_QUANTITY },
					],
				},
			],
		},
		{
			starts_at: downgradeAt,
			plans: [
				{
					plan_id: prepaid.id,
					feature_quantities: [
						{
							feature_id: TestFeature.Messages,
							quantity: DOWNGRADED_QUANTITY,
						},
					],
				},
			],
		},
	];

	return { ...scenario, prepaid, downgradePhases, downgradeAt };
};

const getInvoicePreviews = async ({
	autumn,
	customerId,
}: {
	autumn: Awaited<ReturnType<typeof initScenario>>["autumnV2_5"];
	customerId: string;
}): Promise<ApiInvoicePreviewV0[]> => {
	const customer = await autumn.customers.get<ApiCustomerV5>(customerId, {
		expand: [CustomerExpand.InvoicePreviews],
	});
	return customer.invoice_previews ?? [];
};

const getUpcomingInvoicePreview = async ({
	autumn,
	customerId,
}: {
	autumn: Awaited<ReturnType<typeof initScenario>>["autumnV2_5"];
	customerId: string;
}): Promise<ApiInvoicePreviewV0> => {
	const customer = await autumn.customers.get<ApiCustomerV5>(customerId, {
		expand: [CustomerExpand.InvoicePreviews],
	});
	expect(customer.invoice_previews).toHaveLength(1);
	return customer.invoice_previews![0];
};

const expectDowngradedPreviewCorrect = ({
	preview,
	planId,
	invoiceAt,
}: {
	preview: ApiInvoicePreviewV0;
	planId: string;
	invoiceAt: number;
}) => {
	// The downgrade snaps to the cycle boundary, a few seconds before the requested start.
	expect(timestampsMatch(preview.invoice_at, invoiceAt, ms.minutes(1))).toBe(
		true,
	);
	expect(preview).toMatchObject({
		plan_ids: [planId],
		total: DOWNGRADED_TOTAL,
		line_items: [
			expect.objectContaining({
				plan_id: planId,
				feature_id: TestFeature.Messages,
				quantity: DOWNGRADED_QUANTITY,
				total: DOWNGRADED_TOTAL,
			}),
		],
	});
};

test.concurrent(
	`${chalk.yellowBright("invoice_previews: a prepaid downgrade scheduled with create_schedule bills the lower quantity")}`,
	async () => {
		const customerId = "inv-preview-sched-downgrade";
		const { autumnV1, autumnV2_5, ctx, prepaid, downgradePhases, downgradeAt } =
			await setupPrepaidUpgrade({ customerId });

		await autumnV1.billing.createSchedule<CreateScheduleParamsV0Input>({
			customer_id: customerId,
			phases: downgradePhases,
		});

		const preview = await getUpcomingInvoicePreview({
			autumn: autumnV2_5,
			customerId,
		});

		expectDowngradedPreviewCorrect({
			preview,
			planId: prepaid.id,
			invoiceAt: downgradeAt,
		});
		// subscription_id is internal, so it's stripped from the API response.
		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
		});
		const [subscriptionId] = customerProductsToStripeSubscriptionIds({
			customerProducts: fullCustomer.customer_products,
		});
		await expectStripeUpcomingInvoiceCorrect({
			ctx,
			subscriptionId,
			startsAt: preview.invoice_at,
			total: DOWNGRADED_TOTAL,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("invoice_previews: set_plans next_cycle and the upcoming invoice agree on a scheduled downgrade")}`,
	async () => {
		const customerId = "inv-preview-set-plans-downgrade";
		const { autumnV2_5, prepaid, downgradePhases, downgradeAt } =
			await setupPrepaidUpgrade({
				customerId,
			});
		const params: SetPlansParamsV0Input = {
			customer_id: customerId,
			phases: downgradePhases,
		};

		const setPlansPreview = await autumnV2_5.billing.previewSetPlans(params);
		await autumnV2_5.billing.setPlans(params);

		const preview = await getUpcomingInvoicePreview({
			autumn: autumnV2_5,
			customerId,
		});

		expectDowngradedPreviewCorrect({
			preview,
			planId: prepaid.id,
			invoiceAt: downgradeAt,
		});
		expect(setPlansPreview.next_cycle).toMatchObject({
			starts_at: preview.invoice_at,
			total: DOWNGRADED_TOTAL,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("invoice_previews: a downgrade scheduled on another subscription and an unlinked free plan stay out of a subscription's preview")}`,
	async () => {
		const customerId = "inv-preview-multi-sub-downgrade";
		const pro = products.pro({
			id: `${customerId}-pro`,
			items: [items.monthlyUsers({ includedUsage: 5 })],
		});
		const prepaidAddOn = products.base({
			id: `${customerId}-prepaid`,
			isAddOn: true,
			items: [items.prepaidMessages()],
		});
		const freeAddOn = products.base({
			id: `${customerId}-free`,
			isAddOn: true,
			items: [items.monthlyWords({ includedUsage: 10 })],
		});

		const { autumnV1, autumnV2_5, ctx, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, prepaidAddOn, freeAddOn] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.billing.attach({
					productId: prepaidAddOn.id,
					newBillingSubscription: true,
					options: [
						{ feature_id: TestFeature.Messages, quantity: UPGRADED_QUANTITY },
					],
				}),
			],
		});
		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
		});
		const subscriptionIdFor = (productId: string) =>
			fullCustomer.customer_products.find(
				(customerProduct) => customerProduct.product.id === productId,
			)?.subscription_ids?.[0];
		const subscriptionA = subscriptionIdFor(pro.id)!;
		const subscriptionB = subscriptionIdFor(prepaidAddOn.id)!;
		expect(subscriptionA).not.toBe(subscriptionB);

		const downgradeAt = addMonths(advancedTo, 1).getTime();
		const prepaidPlan = (quantity: number) => ({
			plan_id: prepaidAddOn.id,
			feature_quantities: [{ feature_id: TestFeature.Messages, quantity }],
		});
		await autumnV2_5.billing.setPlans({
			customer_id: customerId,
			stripe_subscription_id: subscriptionB,
			phases: [
				{ starts_at: "now", plans: [prepaidPlan(UPGRADED_QUANTITY)] },
				{ starts_at: downgradeAt, plans: [prepaidPlan(DOWNGRADED_QUANTITY)] },
			],
		} satisfies SetPlansParamsV0Input);
		// Attached after set_plans, which would otherwise end this customer-wide free plan.
		await autumnV1.billing.attach<AttachParamsV0Input>({
			customer_id: customerId,
			product_id: freeAddOn.id,
		});

		const previews = await getInvoicePreviews({
			autumn: autumnV2_5,
			customerId,
		});
		const previewA = previews.find((preview) =>
			preview.plan_ids.includes(pro.id),
		);
		const previewB = previews.find((preview) =>
			preview.plan_ids.includes(prepaidAddOn.id),
		);

		expect(previews).toHaveLength(2);
		expect(previews.map((preview) => preview.plan_ids)).toEqual(
			expect.arrayContaining([[pro.id], [prepaidAddOn.id]]),
		);
		expect(previewA).toMatchObject({ plan_ids: [pro.id], total: 20 });
		await expectStripeUpcomingInvoiceCorrect({
			ctx,
			subscriptionId: subscriptionA,
			startsAt: previewA!.invoice_at,
			total: 20,
		});
		expectDowngradedPreviewCorrect({
			preview: previewB!,
			planId: prepaidAddOn.id,
			invoiceAt: downgradeAt,
		});
	},
);
