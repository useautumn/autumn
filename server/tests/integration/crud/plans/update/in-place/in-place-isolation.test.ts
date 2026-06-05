/**
 * In-place plan edits must not touch ANY other customer. Each case captures the
 * full state of a customer that should NOT change, performs an in-place edit on
 * an UNRELATED plan/feature, and asserts that customer's snapshot is identical.
 *
 * Dimensions: many customers (same plan), different plans sharing a feature,
 * different versions, trials, entities.
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

test(`${chalk.yellowBright("in-place isolation: many customers on the same plan all preserved on ADD")}`, async () => {
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
			s.otherCustomers(others.map((id) => ({ id, paymentMethod: "success" }))),
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
});

test(`${chalk.yellowBright("in-place isolation: different plans sharing a feature do not cross-contaminate")}`, async () => {
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

	expect(await snapshotCustomerState({ ctx, customerId: cusB })).toBe(beforeB);
});

test(`${chalk.yellowBright("in-place isolation: editing latest version leaves older-version customers untouched")}`, async () => {
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
});

test(`${chalk.yellowBright("in-place isolation: a trialing customer on another plan is preserved")}`, async () => {
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
});

test(`${chalk.yellowBright("in-place isolation: an entity-scoped customer on another plan is preserved")}`, async () => {
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
});

test(`${chalk.yellowBright("in-place isolation: a customer with a scheduled change on another plan is preserved")}`, async () => {
	const scheduledCus = "iso-sched-cus";
	const editCus = "iso-sched-edit";
	const schedPlan = products.pro({
		id: "iso_sched_plan",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const editPlan = products.pro({
		id: "iso_sched_edit_plan",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const { ctx } = await initScenario({
		customerId: scheduledCus,
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [schedPlan, editPlan] }),
			s.otherCustomers([
				{ id: editCus, paymentMethod: "success", distinctTestClock: true },
			]),
		],
		actions: [
			s.billing.attach({ productId: schedPlan.id }),
			s.billing.attach({ productId: editPlan.id, customerId: editCus }),
			// Cancel at end of cycle -> scheduled phase on scheduledCus.
			s.updateSubscription({
				productId: schedPlan.id,
				cancelAction: "cancel_end_of_cycle",
			}),
		],
	});

	const beforeSched = await snapshotCustomerState({
		ctx,
		customerId: scheduledCus,
	});

	await rpcFor(ctx).plans.update<ApiPlanV1, RpcInput>(editPlan.id, {
		disable_version: true,
		price: monthPrice,
		items: messagesItems(200),
	});

	expect(await snapshotCustomerState({ ctx, customerId: scheduledCus })).toBe(
		beforeSched,
	);
});

test(`${chalk.yellowBright("in-place isolation: no-customer plan mutates in place (no retired rows)")}`, async () => {
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
});
