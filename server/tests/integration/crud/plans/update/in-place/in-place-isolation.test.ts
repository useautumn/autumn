/**
 * In-place plan edits must not touch ANY other customer. Each case captures the
 * full state of a customer that should NOT change, performs an in-place edit on
 * an UNRELATED plan/feature, and asserts that customer's snapshot is identical.
 *
 * Slice 1/3: many customers (same plan), and the no-customer plan.
 */

import { expect, test } from "bun:test";
import {
	type ApiPlanV1,
	ApiVersion,
	BillingInterval,
	entitlements,
	ResetInterval,
	type UpdatePlanParamsV2Input,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { and, eq } from "drizzle-orm";
import { AutumnRpcCli } from "@/external/autumn/autumnRpcCli.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { snapshotCustomerState } from "./utils/snapshotCustomerState";

type RpcInput = Omit<UpdatePlanParamsV2Input, "plan_id">;

const rpcFor = (ctx: { orgSecretKey: string }) =>
	new AutumnRpcCli({ secretKey: ctx.orgSecretKey, version: ApiVersion.V2_1 });

const messagesItems = (included: number) => [
	{
		feature_id: TestFeature.Messages,
		included,
		reset: { interval: ResetInterval.Month },
	},
];

const monthPrice = { amount: 20, interval: BillingInterval.Month };

test.concurrent(
	`${chalk.yellowBright("in-place isolation: many customers on the same plan all preserved on ADD")}`,
	async () => {
		const primary = "iso-many-primary";
		const others = ["iso-many-2", "iso-many-3", "iso-many-4"];
		const pro = products.pro({
			id: "iso_many",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { ctx } = await initScenario({
			customerId: primary,
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [pro] }),
				s.otherCustomers(
					others.map((id) => ({ id, paymentMethod: "success" })),
				),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				...others.map((id) =>
					s.billing.attach({ productId: pro.id, customerId: id }),
				),
			],
		});

		const all = [primary, ...others];
		const before: Record<string, string> = {};
		for (const id of all)
			before[id] = await snapshotCustomerState({ ctx, customerId: id });

		await rpcFor(ctx).plans.update<ApiPlanV1, RpcInput>(pro.id, {
			disable_version: true,
			price: monthPrice,
			items: [...messagesItems(100), { feature_id: TestFeature.AdminRights }],
		});

		for (const id of all)
			expect(await snapshotCustomerState({ ctx, customerId: id })).toBe(
				before[id],
			);
	},
);

// NOTE: a "scheduled customer" isolation case is intentionally omitted — the
// downgrade/cancel path that creates a scheduled cus_product currently errors at
// setup in this environment (`malformed array literal`, also breaks
// migrate-states.test.ts), unrelated to in-place edits. Scheduled cusProducts
// carry normal customer_entitlements, so the reference check retires (not
// deletes) any ent they hold — the same guarantee the other cases prove.

test.concurrent(
	`${chalk.yellowBright("in-place isolation: no-customer plan mutates in place (no retired rows)")}`,
	async () => {
		const owner = "iso-nocus-owner";
		const pro = products.pro({
			id: "iso_nocus",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { ctx } = await initScenario({
			customerId: owner,
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		// No customers on the plan -> mutate in place, no is_custom:true rows left.
		await rpcFor(ctx).plans.update<ApiPlanV1, RpcInput>(pro.id, {
			disable_version: true,
			price: monthPrice,
			items: messagesItems(200),
		});

		const product = await ProductService.getFull({
			db: ctx.db,
			idOrInternalId: pro.id,
			orgId: ctx.org.id,
			env: ctx.env,
		});
		expect(
			product.entitlements.find((e) => e.feature?.id === TestFeature.Messages)
				?.allowance,
		).toBe(200);
		const customEnts = await ctx.db
			.select()
			.from(entitlements)
			.where(
				and(
					eq(entitlements.internal_product_id, product.internal_id),
					eq(entitlements.is_custom, true),
				),
			);
		expect(customEnts).toHaveLength(0);
	},
);
