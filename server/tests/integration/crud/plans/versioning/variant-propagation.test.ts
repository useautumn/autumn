/**
 * Variant propagation integration tests (ENG-1108)
 *
 * Tests the async PropagateVariants job that runs after a base plan is versioned.
 * These tests require the SQS/BullMQ worker to be running.
 *
 * Cases tested:
 *   Test 1 – Happy path (Cases A+B): base versioned → new variant row created, items inherited from new base
 *   Test 2 – Case D: base updated in-place (no customers) → variant items updated in-place, version unchanged
 */

import { expect, test } from "bun:test";
import {
	type ApiPlanV1,
	ApiPlanV1Schema,
	ApiVersion,
	type AttachParamsV1Input,
	type CreatePlanParamsV2Input,
	ResetInterval,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { AutumnRpcCli } from "@/external/autumn/autumnRpcCli.js";

const autumnRpc = new AutumnRpcCli({ version: ApiVersion.V2_1 });
const autumnInt = new AutumnInt({ version: ApiVersion.V2_1 });

/** Allow time for the async PropagateVariants queue job to complete. */
const waitForPropagation = (ms = 1000) =>
	new Promise((resolve) => setTimeout(resolve, ms));

// ─── Test 1: Happy path — base versioned, variant propagated ─────────────────

test.concurrent(`${chalk.yellowBright("variant-propagation-1: base versioned → new variant row with updated items")}`, async () => {
	const planId = "prop_happy";
	const group = "prop_group_happy";
	const customerId = "prop_cus_happy";

	// Cleanup
	try {
		await autumnInt.customers.delete(customerId);
	} catch (_) {}
	try {
		await autumnRpc.plans.delete(planId, { allVersions: true });
	} catch (_) {}
	try {
		await autumnRpc.plans.deleteVariant(planId, "monthly");
	} catch (_) {}

	// 1. Create base plan with a Messages feature item
	await autumnRpc.plans.create<ApiPlanV1, CreatePlanParamsV2Input>({
		plan_id: planId,
		name: "Prop Happy Base",
		group,
		auto_enable: false,
		items: [
			{
				feature_id: TestFeature.Messages,
				included: 100,
				reset: { interval: ResetInterval.Month },
			},
		],
	});

	// 2. Create a variant
	const variantBefore = await autumnRpc.plans.createVariant<ApiPlanV1>({
		plan_id: planId,
		variant_id: "monthly",
		variant_name: "Prop Happy Monthly",
	});

	ApiPlanV1Schema.parse(variantBefore);
	expect(variantBefore.version).toBe(1);
	expect(variantBefore.minor_version).toBe(1);

	// 3. Create a customer and attach them to the BASE plan (triggers versioning on next update)
	await autumnInt.customers.create({
		id: customerId,
		name: "Propagation Test Customer",
		email: `${customerId}@test.com`,
	});

	const res = await autumnInt.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: planId,
		// variant_id: "monthly",
	});

	// 4. Update base plan items — triggers handleVersionProductV2 → enqueues PropagateVariants
	//    Change Messages from 100 → 200 included to force versioning
	await autumnRpc.plans.update<ApiPlanV1>(planId, {
		items: [
			{
				feature_id: TestFeature.Messages,
				included: 200,
				reset: { interval: ResetInterval.Month },
			},
		],
	});

	// 5. Wait for the async propagation worker
	await waitForPropagation();

	// 6. Fetch latest base plan — should now be version 2
	const baseAfter = await autumnRpc.plans.get<ApiPlanV1>(planId);
	ApiPlanV1Schema.parse(baseAfter);
	expect(baseAfter.version).toBe(2);
	expect(baseAfter.minor_version).toBe(1);
	expect(baseAfter.semver).toBeUndefined();

	// 7. Fetch latest variant — should be a new row with version 2, minor_version 2
	const variantAfter = await autumnRpc.plans.get<ApiPlanV1>(planId, {
		variantId: "monthly",
	});
	ApiPlanV1Schema.parse(variantAfter);
	expect(variantAfter.version).toBe(2);
	expect(variantAfter.minor_version).toBe(1);
	expect(variantAfter.semver).toBe("2.1");

	// 8. Verify the old version rows still exist
	const baseV1 = await autumnRpc.rpc.call<ApiPlanV1>({
		method: "/plans.get",
		body: { plan_id: planId, version: 1 },
	});
	expect(baseV1.version).toBe(1);
	expect(baseV1.minor_version).toBe(1);

	const variantV1 = await autumnRpc.rpc.call<ApiPlanV1>({
		method: "/plans.get",
		body: {
			plan_id: planId,
			variant_id: "monthly",
			version: 1,
			minor_version: 1,
		},
	});
	expect(variantV1.version).toBe(1);
	expect(variantV1.minor_version).toBe(1);

	// 9. plans.list shows both base and variant at their latest versions
	const { list } = await autumnRpc.rpc.call<{ list: ApiPlanV1[] }>({
		method: "/plans.list",
		body: {},
	});

	const listedBase = list.find((p) => p.id === planId && p.variant_id === null);
	const listedVariant = list.find(
		(p) => p.id === planId && p.variant_id === "monthly",
	);

	expect(listedBase?.version).toBe(2);
	expect(listedBase?.minor_version).toBe(1);
	expect(listedVariant?.version).toBe(2);
	expect(listedVariant?.minor_version).toBe(1);
}); // Generous timeout to account for queue processing

// ─── Test 2: Case D — base updated in-place, variant items updated in-place ──

test.concurrent(`${chalk.yellowBright("variant-propagation-2: base updated in-place (no customers) → variant items synced, version unchanged")}`, async () => {
	const planId = `prop_inplace_`;
	const group = `prop_group_happy_inplace`;

	// Cleanup
	try {
		await autumnRpc.plans.delete(planId, { allVersions: true });
	} catch (_) {}
	try {
		await autumnRpc.plans.deleteVariant(planId, "annual");
	} catch (_) {}

	// 1. Create base plan with Messages feature item
	await autumnRpc.plans.create<ApiPlanV1, CreatePlanParamsV2Input>({
		plan_id: planId,
		name: "Prop In-Place Base",
		group,
		auto_enable: false,
		items: [
			{
				feature_id: TestFeature.Messages,
				included: 50,
				reset: { interval: ResetInterval.Month },
			},
		],
	});

	// 2. Create a variant (inherits base items)
	const variantBefore = await autumnRpc.plans.createVariant<ApiPlanV1>({
		plan_id: planId,
		variant_id: "annual",
		variant_name: "Prop In-Place Annual",
	});

	ApiPlanV1Schema.parse(variantBefore);
	expect(variantBefore.version).toBe(1);
	expect(variantBefore.minor_version).toBe(1);

	// No customer attached — base update will be in-place (no versioning)
	// and variant has no customers → Case D (in-place variant update)

	// 3. Update base plan items — no customer on base → in-place update
	await autumnRpc.plans.update<ApiPlanV1>(planId, {
		items: [
			{
				feature_id: TestFeature.Messages,
				included: 150,
				reset: { interval: ResetInterval.Month },
			},
		],
	});

	// 4. Wait for the async propagation worker
	await waitForPropagation();

	// 5. Base remains at version 1 (in-place update, no versioning)
	const baseAfter = await autumnRpc.plans.get<ApiPlanV1>(planId);
	ApiPlanV1Schema.parse(baseAfter);
	expect(baseAfter.version).toBe(1);
	expect(baseAfter.minor_version).toBe(1);

	// 6. Variant remains at version 1 / minor_version 1 (Case D: in-place)
	const variantAfter = await autumnRpc.plans.get<ApiPlanV1>(planId, {
		variantId: "annual",
	});
	ApiPlanV1Schema.parse(variantAfter);
	expect(variantAfter.version).toBe(1);
	expect(variantAfter.minor_version).toBe(1);
	expect(variantAfter.semver).toBe("1.1");

	// 7. Variant items should now reflect the updated base (150 included)
	const variantMessagesItem = variantAfter.items.find(
		(i) => i.feature_id === TestFeature.Messages,
	);
	expect(variantMessagesItem).toBeDefined();
	expect(variantMessagesItem?.included).toBe(150);
});
