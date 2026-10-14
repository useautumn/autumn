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
