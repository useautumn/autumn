import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	type AttachPreviewResponse,
	CusProductStatus,
	customerProducts,
	ms,
} from "@autumn/shared";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { and, eq } from "drizzle-orm";

const getCustomerProduct = async ({
	ctx,
	customerId,
	productId,
	status,
}: {
	ctx: Awaited<ReturnType<typeof initScenario>>["ctx"];
	customerId: string;
	productId: string;
	status: CusProductStatus;
}) => {
	const [customerProduct] = await ctx.db
		.select()
		.from(customerProducts)
		.where(
			and(
				eq(customerProducts.customer_id, customerId),
				eq(customerProducts.product_id, productId),
				eq(customerProducts.status, status),
			),
		);
	return customerProduct;
};

test.concurrent(
	`${chalk.yellowBright("create-schedule preserve add-ons: keeps the existing recurring add-on in every phase")}`,
	async () => {
		const customerId = "create-schedule-preserve-existing-addon";
		const pro = products.pro({
			id: "preserve-addon-pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const premium = products.premium({
			id: "preserve-addon-premium",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});
		const addon = products.recurringAddOn({
			id: "preserve-addon",
			items: [items.monthlyWords({ includedUsage: 50 })],
		});
		const { autumnV1, ctx, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium, addon] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.billing.attach({ productId: addon.id }),
			],
		});
		const addonBefore = await getCustomerProduct({
			ctx,
			customerId,
			productId: addon.id,
			status: CusProductStatus.Active,
		});
		expect(addonBefore).toBeDefined();

		const params = {
			customer_id: customerId,
			preserve_add_ons: true,
			phases: [
				{
					starts_at: advancedTo,
					plans: [{ plan_id: premium.id }],
				},
				{
					starts_at: advancedTo + ms.days(30),
					plans: [{ plan_id: pro.id }],
				},
			],
		};
		const preview = (await autumnV1.post(
			"/billing.preview_create_schedule",
			params,
		)) as AttachPreviewResponse;
		expect(preview.outgoing.some((change) => change.plan_id === addon.id)).toBe(
			false,
		);
		expect(preview.incoming.some((change) => change.plan_id === addon.id)).toBe(
			false,
		);

		const response = await autumnV1.billing.createSchedule(params);

		expect(response.phases).toHaveLength(2);
		expect(
			response.phases.every((phase) =>
				phase.customer_product_ids.includes(addonBefore!.id),
			),
		).toBe(true);

		const addonAfter = await getCustomerProduct({
			ctx,
			customerId,
			productId: addon.id,
			status: CusProductStatus.Active,
		});
		expect(addonAfter?.id).toBe(addonBefore!.id);
		expect(addonAfter?.ended_at).toBeNull();
		expect(addonAfter?.canceled_at).toBeNull();
		await expectStripeSubscriptionCorrect({ ctx, customerId });
	},
);

test.concurrent(
	`${chalk.yellowBright("create-schedule preserve add-ons: omitted flag keeps replacement semantics")}`,
	async () => {
		const customerId = "create-schedule-replace-existing-addon";
		const pro = products.pro({
			id: "replace-addon-pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const premium = products.premium({
			id: "replace-addon-premium",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});
		const addon = products.recurringAddOn({
			id: "replace-addon",
			items: [items.monthlyWords({ includedUsage: 50 })],
		});
		const { autumnV1, ctx, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium, addon] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.billing.attach({ productId: addon.id }),
			],
		});
		const addonBefore = await getCustomerProduct({
			ctx,
			customerId,
			productId: addon.id,
			status: CusProductStatus.Active,
		});
		expect(addonBefore).toBeDefined();

		const response = await autumnV1.billing.createSchedule({
			customer_id: customerId,
			phases: [
				{
					starts_at: advancedTo,
					plans: [{ plan_id: premium.id }],
				},
			],
		});

		expect(response.phases[0]?.customer_product_ids).not.toContain(
			addonBefore!.id,
		);
		const addonAfter = await ctx.db.query.customerProducts.findFirst({
			where: eq(customerProducts.id, addonBefore!.id),
		});
		expect(addonAfter?.status).toBe(CusProductStatus.Expired);
	},
);

test.concurrent(
	`${chalk.yellowBright("create-schedule preserve add-ons: keeps existing add-ons when adding another")}`,
	async () => {
		const customerId = "create-schedule-replace-selected-addon";
		const oldAddon = products.base({
			id: "old-selected-addon",
			group: "selected-addon",
			isAddOn: true,
			items: [items.monthlyMessages()],
		});
		const newAddon = products.base({
			id: "new-selected-addon",
			group: "selected-addon",
			isAddOn: true,
			items: [items.monthlyWords()],
		});
		const preservedAddon = products.recurringAddOn({
			id: "unselected-addon",
			items: [items.monthlyCredits()],
		});
		const { autumnV1, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [oldAddon, newAddon, preservedAddon] }),
			],
			actions: [
				s.billing.attach({ productId: oldAddon.id }),
				s.billing.attach({ productId: preservedAddon.id }),
			],
		});

		await autumnV1.billing.createSchedule({
			customer_id: customerId,
			preserve_add_ons: true,
			phases: [{ starts_at: "now", plans: [{ plan_id: newAddon.id }] }],
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerProducts({
			customer,
			active: [oldAddon.id, newAddon.id, preservedAddon.id],
		});
		await expectStripeSubscriptionCorrect({ ctx, customerId });
	},
);
