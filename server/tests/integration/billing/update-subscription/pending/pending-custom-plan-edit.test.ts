import { expect, test } from "bun:test";
import {
	type AttachParamsV1Input,
	CusProductStatus,
	customers,
	EntitlementDuration,
	type UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";

const setupCustomPendingPlan = async ({ name }: { name: string }) => {
	const customerId = `${name}-${Date.now()}`;
	const pro = products.pro({
		id: `pro-${name}`,
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const scenario = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [pro] })],
		actions: [],
	});

	await scenario.autumnV2_2.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: pro.id,
		customize: {
			price: itemsV2.monthlyPrice({ amount: 1200 }),
			items: [itemsV2.monthlyMessages({ included: 100 })],
		},
	});

	const listPendingRows = async () => {
		const dbCustomer = await scenario.ctx.db.query.customers.findFirst({
			where: eq(customers.id, customerId),
		});
		return CusProductService.list({
			db: scenario.ctx.db,
			internalCustomerId: dbCustomer!.internal_id,
			inStatuses: [CusProductStatus.Pending],
		});
	};

	return { ...scenario, customerId, pro, listPendingRows };
};

test.concurrent(
	`${chalk.yellowBright("pending custom plan edit: replacing the items keeps the custom price and the original payment")}`,
	async () => {
		const { autumnV2_2, customerId, pro, listPendingRows } =
			await setupCustomPendingPlan({ name: "pending-custom-items-edit" });
		const [originalRow] = await listPendingRows();

		const updateParams: UpdateSubscriptionV1ParamsInput = {
			customer_id: customerId,
			plan_id: pro.id,
			customize: { items: [itemsV2.monthlyMessages({ included: 200 })] },
		};

		const preview =
			await autumnV2_2.subscriptions.previewUpdate<UpdateSubscriptionV1ParamsInput>(
				updateParams,
			);
		expect(preview.total).toBe(0);

		await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>(
			updateParams,
		);

		const pendingRows = await listPendingRows();
		expect(pendingRows).toHaveLength(1);
		const [pendingRow] = pendingRows;
		expect(pendingRow.metadata_id).toBe(originalRow.metadata_id);
		expect(
			pendingRow.customer_prices.map(
				(customerPrice) =>
					(customerPrice.price.config as { amount?: number }).amount,
			),
		).toEqual([1200]);
		expect(
			pendingRow.customer_entitlements.map(
				(customerEntitlement) => customerEntitlement.entitlement.allowance,
			),
		).toEqual([200]);
	},
);

test.concurrent(
	`${chalk.yellowBright("pending custom plan edit: add_items keeps the custom price and existing items")}`,
	async () => {
		const { autumnV2_2, customerId, pro, listPendingRows } =
			await setupCustomPendingPlan({ name: "pending-custom-add-items" });

		await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: pro.id,
			customize: { add_items: [itemsV2.dashboard()] },
		});

		const [pendingRow] = await listPendingRows();
		const featureIds = pendingRow.customer_entitlements.map(
			(customerEntitlement) => customerEntitlement.entitlement.feature_id,
		);
		expect(featureIds.sort()).toEqual(
			[TestFeature.Dashboard, TestFeature.Messages].sort(),
		);
		expect(
			pendingRow.customer_prices.map(
				(customerPrice) =>
					(customerPrice.price.config as { amount?: number }).amount,
			),
		).toEqual([1200]);
	},
);

test.concurrent(
	`${chalk.yellowBright("pending custom plan edit: a price-only edit keeps expiring one-off credits")}`,
	async () => {
		const customerId = `pending-custom-expiry-${Date.now()}`;
		const pro = products.pro({
			id: "pro-pending-custom-expiry",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [pro] })],
			actions: [],
		});

		await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: pro.id,
			feature_quantities: [{ feature_id: TestFeature.Messages, quantity: 100 }],
			customize: {
				price: itemsV2.monthlyPrice({ amount: 1200 }),
				items: [
					{
						...itemsV2.oneOffPrepaidMessages(),
						expiry: { duration: EntitlementDuration.Month, length: 1 },
					},
				],
			},
		});

		await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: pro.id,
			customize: { price: itemsV2.monthlyPrice({ amount: 1000 }) },
		});

		const dbCustomer = await ctx.db.query.customers.findFirst({
			where: eq(customers.id, customerId),
		});
		const [pendingRow] = await CusProductService.list({
			db: ctx.db,
			internalCustomerId: dbCustomer!.internal_id,
			inStatuses: [CusProductStatus.Pending],
		});
		const [messages] = pendingRow.customer_entitlements.map(
			(customerEntitlement) => customerEntitlement.entitlement,
		);
		expect(messages.expiry_duration).toBe(EntitlementDuration.Month);
		expect(messages.expiry_length).toBe(1);
	},
);
