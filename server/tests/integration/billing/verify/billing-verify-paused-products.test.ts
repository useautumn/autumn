/**
 * Billing Verify: a plan parked as Paused is still live on Stripe
 *
 * A trial attached with on_end: "revert" is Autumn-only: it parks the current
 * plan as Paused, writes nothing to Stripe (the subscription keeps billing the
 * parked plan, the trial plan never appears there), and revertTrialExpiry
 * restores the parked plan with a status flip. While the trial runs, the
 * paused plan's items are the expected Stripe state and the trialing plan
 * contributes nothing.
 *
 * Red (current): verify loads only RELEVANT_STATUSES and expects the trialing
 * plan, so it reports the trial's items as missing and the parked plan's items
 * as not in Autumn.
 * Green (after): both scenarios verify with no mismatches.
 */

import { expect, test } from "bun:test";
import {
	type AttachParamsV1Input,
	CusProductStatus,
	FreeTrialDuration,
} from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { verify } from "@/internal/billing/v2/actions/verify/verify";
import { CusService } from "@/internal/customers/CusService";

const attachRevertingTrial = async ({
	autumnV2_2,
	customerId,
	planId,
}: {
	autumnV2_2: Awaited<ReturnType<typeof initScenario>>["autumnV2_2"];
	customerId: string;
	planId: string;
}) =>
	autumnV2_2.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: planId,
		redirect_mode: "if_required",
		customize: {
			free_trial: {
				duration_length: 14,
				duration_type: FreeTrialDuration.Day,
				card_required: true,
				on_end: "revert",
			},
		},
	});

const expectPaused = async ({
	ctx,
	customerId,
	productId,
}: {
	ctx: Awaited<ReturnType<typeof initScenario>>["ctx"];
	customerId: string;
	productId: string;
}) => {
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
		inStatuses: [CusProductStatus.Paused],
	});
	expect(fullCustomer.customer_products.map((cp) => cp.product.id)).toContain(
		productId,
	);
};

test.concurrent(
	`${chalk.yellowBright("billing-verify paused-products 1: reverting trial on the same subscription -> paused plan's items are expected")}`,
	async () => {
		const customerId = "verify-paused-same-sub";
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const enterprise = products.premium({
			id: "enterprise",
			items: [items.monthlyMessages({ includedUsage: 1000 })],
		});
		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, enterprise] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		await attachRevertingTrial({
			autumnV2_2,
			customerId,
			planId: enterprise.id,
		});
		await expectPaused({ ctx, customerId, productId: pro.id });

		const result = await verify({ ctx, params: { customer_id: customerId } });

		expect(result.subscriptions.flatMap((sub) => sub.mismatches)).toEqual([]);
	},
);

test.concurrent(
	`${chalk.yellowBright("billing-verify paused-products 2: reverting trial on a new subscription -> paused plan's subscription is not an orphan")}`,
	async () => {
		const customerId = "verify-paused-new-sub";
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const enterprise = products.premium({
			id: "enterprise",
			items: [items.monthlyMessages({ includedUsage: 1000 })],
		});
		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, enterprise] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: enterprise.id,
			redirect_mode: "if_required",
			new_billing_subscription: true,
			customize: {
				free_trial: {
					duration_length: 14,
					duration_type: FreeTrialDuration.Day,
					card_required: true,
					on_end: "revert",
				},
			},
		});
		await expectPaused({ ctx, customerId, productId: pro.id });

		const result = await verify({ ctx, params: { customer_id: customerId } });

		expect(result.subscriptions.flatMap((sub) => sub.mismatches)).toEqual([]);
	},
);
