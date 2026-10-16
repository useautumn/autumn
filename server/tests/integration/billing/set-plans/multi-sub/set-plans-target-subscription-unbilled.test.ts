/**
 * A paid plan no Stripe subscription bills belongs to every subscription's Set Plans scope:
 * listing it on subscription A starts billing it there, with a preview warning; omitting it ends it.
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3, SetPlansParamsV0Input } from "@autumn/shared";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { timeout } from "@tests/utils/genUtils";
import chalk from "chalk";
import {
	fetchLiveCustomerProduct,
	initMultiSubScenario,
} from "./multiSubScenario";

/** The multi-sub customer plus the monthly add-on attached without billing, so no subscription carries it. */
const initWithUnbilledAddOn = async ({
	customerId,
}: {
	customerId: string;
}) => {
	const scenario = await initMultiSubScenario({ customerId });
	await scenario.autumnV2_2.billing.attach({
		customer_id: customerId,
		plan_id: scenario.plans.monthlyAddOn.id,
		no_billing_changes: true,
		redirect_mode: "never",
	});
	await timeout(2000);
	const unbilled = await fetchLiveCustomerProduct({
		ctx: scenario.ctx,
		customerId,
		productId: scenario.plans.monthlyAddOn.id,
	});
	expect(unbilled?.subscription_ids ?? []).toEqual([]);
	return scenario;
};

test.concurrent(
	`${chalk.yellowBright("set-plans multi-sub unbilled: listing an unbilled paid plan on subscription A bills it there and warns")}`,
	async () => {
		const customerId = "set-plans-multi-sub-unbilled-pull";
		const { autumnV1, autumnV2_4, ctx, subscriptionA, subscriptionB, plans } =
			await initWithUnbilledAddOn({ customerId });
		const seatsBefore = await fetchLiveCustomerProduct({
			ctx,
			customerId,
			productId: plans.seats.id,
		});
		const { invoices: invoicesBefore = [] } =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		const params: SetPlansParamsV0Input = {
			customer_id: customerId,
			stripe_subscription_id: subscriptionA,
			phases: [
				{
					starts_at: "now",
					plans: [
						{ plan_id: plans.pro.id },
						{ plan_id: plans.freeAddOn.id },
						{ plan_id: plans.monthlyAddOn.id },
					],
				},
			],
		};

		const preview = await autumnV2_4.billing.previewSetPlans(params);
		expect(preview.warnings).toContainEqual(
			expect.objectContaining({
				type: "unbilled_plans_added",
				severity: "warning",
				message: `${plans.monthlyAddOn.name} isn't billed on any subscription. Saving adds it to this subscription.`,
			}),
		);
		expect(preview.total).toBeGreaterThan(0);
		expect(
			preview.line_items.some((lineItem) =>
				lineItem.description?.includes(plans.monthlyAddOn.name ?? ""),
			),
		).toBe(true);

		await autumnV2_4.billing.setPlans(params);

		const addOn = await fetchLiveCustomerProduct({
			ctx,
			customerId,
			productId: plans.monthlyAddOn.id,
		});
		expect(addOn?.subscription_ids).toEqual([subscriptionA]);
		const seatsAfter = await fetchLiveCustomerProduct({
			ctx,
			customerId,
			productId: plans.seats.id,
		});
		expect(seatsAfter?.id).toBe(seatsBefore?.id);
		expect(seatsAfter?.subscription_ids).toEqual([subscriptionB]);

		const { invoices = [] } =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expect(invoices.length).toBe(invoicesBefore.length + 1);
		expect(invoices[0]?.total).toBe(preview.total);

		await expectStripeSubscriptionCorrect({
			ctx,
			customerId,
			options: { subCount: 2 },
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans multi-sub unbilled: omitting an unbilled paid plan on subscription A ends it")}`,
	async () => {
		const customerId = "set-plans-multi-sub-unbilled-omit";
		const { autumnV2_4, ctx, subscriptionA, subscriptionB, plans } =
			await initWithUnbilledAddOn({ customerId });

		const preview = await autumnV2_4.billing.previewSetPlans({
			customer_id: customerId,
			stripe_subscription_id: subscriptionA,
			phases: [{ starts_at: "now", plans: [{ plan_id: plans.pro.id }] }],
		});
		expect(preview.warnings.map(({ type }) => type)).not.toContain(
			"unbilled_plans_added",
		);

		await autumnV2_4.billing.setPlans({
			customer_id: customerId,
			stripe_subscription_id: subscriptionA,
			phases: [{ starts_at: "now", plans: [{ plan_id: plans.pro.id }] }],
		});

		const fetchLive = (productId: string) =>
			fetchLiveCustomerProduct({ ctx, customerId, productId });
		expect(await fetchLive(plans.monthlyAddOn.id)).toBeUndefined();
		expect((await fetchLive(plans.seats.id))?.subscription_ids).toEqual([
			subscriptionB,
		]);
	},
);
