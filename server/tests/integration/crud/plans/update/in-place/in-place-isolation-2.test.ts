/**
 * In-place plan edits must not touch ANY other customer. Each case captures the
 * full state of a customer that should NOT change, performs an in-place edit on
 * an UNRELATED plan/feature, and asserts that customer's snapshot is identical.
 *
 * Slice 2/3: different plans sharing a feature, and different versions.
 */

import { expect, test } from "bun:test";
import {
	type ApiPlanV1,
	ApiVersion,
	BillingInterval,
	ResetInterval,
	type UpdatePlanParamsV2Input,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
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
	`${chalk.yellowBright("in-place isolation: different plans sharing a feature do not cross-contaminate")}`,
	async () => {
		const cusA = "iso-shared-a";
		const cusB = "iso-shared-b";
		const planA = products.pro({
			id: "iso_shared_a",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const planB = products.pro({
			id: "iso_shared_b",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		const { ctx } = await initScenario({
			customerId: cusA,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [planA, planB] }),
				s.otherCustomers([{ id: cusB, paymentMethod: "success" }]),
			],
			actions: [
				s.billing.attach({ productId: planA.id }),
				s.billing.attach({ productId: planB.id, customerId: cusB }),
			],
		});

		const beforeB = await snapshotCustomerState({ ctx, customerId: cusB });

		// UPDATE plan A's Messages allowance — plan B grants the same feature via a
		// SEPARATE catalog ent, so its customer must be untouched.
		await rpcFor(ctx).plans.update<ApiPlanV1, RpcInput>(planA.id, {
			disable_version: true,
			price: monthPrice,
			items: messagesItems(200),
		});

		expect(await snapshotCustomerState({ ctx, customerId: cusB })).toBe(
			beforeB,
		);
	},
);

test.concurrent(
	`${chalk.yellowBright("in-place isolation: editing latest version leaves older-version customers untouched")}`,
	async () => {
		const cusV1 = "iso-version-v1";
		const cusV2 = "iso-version-v2";
		const pro = products.pro({
			id: "iso_version",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV1, autumnV2_2, ctx } = await initScenario({
			customerId: cusV1,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
				s.otherCustomers([{ id: cusV2, paymentMethod: "success" }]),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		// Bump to v2 (cusV1 stays on v1), attach cusV2 to v2.
		await autumnV1.products.update(pro.id, {
			items: [items.monthlyMessages({ includedUsage: 200 })],
		});
		await autumnV2_2.billing.attach({ customer_id: cusV2, plan_id: pro.id });

		const beforeV1 = await snapshotCustomerState({ ctx, customerId: cusV1 });

		// In-place edit resolves to the latest (v2). v1's customer + v1's catalog
		// ents are different rows → unaffected.
		await rpcFor(ctx).plans.update<ApiPlanV1, RpcInput>(pro.id, {
			disable_version: true,
			price: monthPrice,
			items: messagesItems(300),
		});

		expect(await snapshotCustomerState({ ctx, customerId: cusV1 })).toBe(
			beforeV1,
		);
		const v1Product = await ProductService.getFull({
			db: ctx.db,
			idOrInternalId: pro.id,
			orgId: ctx.org.id,
			env: ctx.env,
			version: 1,
		});
		expect(
			v1Product.entitlements.find((e) => e.feature?.id === TestFeature.Messages)
				?.allowance,
		).toBe(100);
	},
);
