/**
 * Edge cases for editing a pending plan sold through a long-lived checkout link.
 *
 * Contract:
 * - Repeated edits before anyone opens the link keep one link and one pending row,
 *   and the link sells the last edit.
 * - An edit to an entity's plan keeps the link and the pending row on that entity.
 * - Cancelling the pending plan closes the link.
 */

import { expect, test } from "bun:test";
import {
	type AttachParamsV1Input,
	CusProductStatus,
	customers,
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
import {
	getLongLivedCheckoutId,
	getStripeSessionId,
	requestLongLivedCheckoutStart,
	startLongLivedCheckout,
} from "./utils/longLivedCheckoutUtils";

/** Sends a $1,200 long-lived link without opening it, optionally for an entity. */
const setupLongLivedLink = async ({
	name,
	onEntity = false,
}: {
	name: string;
	onEntity?: boolean;
}) => {
	const customerId = `${name}-${Date.now()}`;
	const pro = products.pro({
		id: `pro-${name}`,
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const scenario = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true }),
			s.products({ list: [pro] }),
			...(onEntity
				? [s.entities({ count: 1, featureId: TestFeature.Users })]
				: []),
		],
		actions: [],
	});
	const { autumnV2_2, ctx } = scenario;
	const entityId = onEntity ? scenario.entities[0].id : undefined;

	const attachResult = await autumnV2_2.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		entity_id: entityId,
		plan_id: pro.id,
		long_lived_checkout: true,
		customize: { price: itemsV2.monthlyPrice({ amount: 1200 }) },
	});

	const listPendingRows = async () => {
		const dbCustomer = await ctx.db.query.customers.findFirst({
			where: eq(customers.id, customerId),
		});
		return CusProductService.list({
			db: ctx.db,
			internalCustomerId: dbCustomer!.internal_id,
			inStatuses: [CusProductStatus.Pending],
		});
	};

	const editPrice = (amount: number) =>
		autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			entity_id: entityId,
			plan_id: pro.id,
			customize: { price: itemsV2.monthlyPrice({ amount }) },
		});

	return {
		...scenario,
		customerId,
		entityId,
		pro,
		linkUrl: attachResult.payment_url,
		checkoutId: getLongLivedCheckoutId(attachResult.payment_url),
		listPendingRows,
		editPrice,
	};
};

test.concurrent(
	`${chalk.yellowBright("long-lived checkout pending edge cases: repeated edits before the link is opened keep one link and sell the last edit")}`,
	async () => {
		const { ctx, linkUrl, checkoutId, listPendingRows, editPrice } =
			await setupLongLivedLink({ name: "ll-edge-repeated" });

		for (const amount of [1500, 800, 950]) {
			const updateResult = await editPrice(amount);
			expect(updateResult.payment_url).toBe(linkUrl);
			expect(await listPendingRows()).toHaveLength(1);
		}

		const session = await ctx.stripeCli.checkout.sessions.retrieve(
			getStripeSessionId(await startLongLivedCheckout(checkoutId)),
		);
		expect(session.amount_total).toBe(95_000);
	},
);

test.concurrent(
	`${chalk.yellowBright("long-lived checkout pending edge cases: an entity's edit keeps the link and stays on the entity")}`,
	async () => {
		const { ctx, entityId, linkUrl, checkoutId, listPendingRows, editPrice } =
			await setupLongLivedLink({ name: "ll-edge-entity", onEntity: true });

		const updateResult = await editPrice(1000);
		expect(updateResult.payment_url).toBe(linkUrl);

		const pendingRows = await listPendingRows();
		expect(pendingRows.map((row) => row.entity_id)).toEqual([entityId]);

		const session = await ctx.stripeCli.checkout.sessions.retrieve(
			getStripeSessionId(await startLongLivedCheckout(checkoutId)),
		);
		expect(session.amount_total).toBe(100_000);
	},
);

test.concurrent(
	`${chalk.yellowBright("long-lived checkout pending edge cases: cancelling the pending plan closes the link")}`,
	async () => {
		const { autumnV2_2, customerId, pro, checkoutId, listPendingRows } =
			await setupLongLivedLink({ name: "ll-edge-cancel" });

		await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: pro.id,
			cancel_action: "cancel_immediately",
		});

		expect(await listPendingRows()).toHaveLength(0);
		const reopen = await requestLongLivedCheckoutStart(checkoutId);
		expect(reopen.status).toBe(409);
	},
);
