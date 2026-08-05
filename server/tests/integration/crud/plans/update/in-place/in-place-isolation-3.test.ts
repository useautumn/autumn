/**
 * In-place plan edits must not touch ANY other customer. Each case captures the
 * full state of a customer that should NOT change, performs an in-place edit on
 * an UNRELATED plan/feature, and asserts that customer's snapshot is identical.
 *
 * Slice 3/3: trials, and entities.
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
	`${chalk.yellowBright("in-place isolation: a trialing customer on another plan is preserved")}`,
	async () => {
		const trialCus = "iso-trial-cus";
		const editCus = "iso-trial-edit";
		const trialPlan = products.proWithTrial({
			id: "iso_trial_plan",
			trialDays: 7,
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const editPlan = products.pro({
			id: "iso_trial_edit_plan",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { ctx } = await initScenario({
			customerId: trialCus,
			setup: [
				s.customer({ testClock: true, paymentMethod: "success" }),
				s.products({ list: [trialPlan, editPlan] }),
				s.otherCustomers([{ id: editCus, paymentMethod: "success" }]),
			],
			actions: [
				s.billing.attach({ productId: trialPlan.id }),
				s.billing.attach({ productId: editPlan.id, customerId: editCus }),
			],
		});

		const beforeTrial = await snapshotCustomerState({
			ctx,
			customerId: trialCus,
		});

		await rpcFor(ctx).plans.update<ApiPlanV1, RpcInput>(editPlan.id, {
			disable_version: true,
			price: monthPrice,
			items: messagesItems(200),
		});

		expect(await snapshotCustomerState({ ctx, customerId: trialCus })).toBe(
			beforeTrial,
		);
	},
);

test.concurrent(
	`${chalk.yellowBright("in-place isolation: an entity-scoped customer on another plan is preserved")}`,
	async () => {
		const entityCus = "iso-entity-cus";
		const editCus = "iso-entity-edit";
		const entityPlan = products.pro({
			id: "iso_entity_plan",
			items: [
				items.monthlyMessages({
					includedUsage: 100,
					entityFeatureId: TestFeature.Users,
				}),
			],
		});
		const editPlan = products.pro({
			id: "iso_entity_edit_plan",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { ctx } = await initScenario({
			customerId: entityCus,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [entityPlan, editPlan] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
				s.otherCustomers([{ id: editCus, paymentMethod: "success" }]),
			],
			actions: [
				s.billing.attach({ productId: entityPlan.id, entityIndex: 0 }),
				s.billing.attach({ productId: editPlan.id, customerId: editCus }),
			],
		});

		const beforeEntity = await snapshotCustomerState({
			ctx,
			customerId: entityCus,
		});

		await rpcFor(ctx).plans.update<ApiPlanV1, RpcInput>(editPlan.id, {
			disable_version: true,
			price: monthPrice,
			items: messagesItems(200),
		});

		expect(await snapshotCustomerState({ ctx, customerId: entityCus })).toBe(
			beforeEntity,
		);
	},
);
