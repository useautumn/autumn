// Contract: Pro and Pro Annual price the same 200-message dev seat at $20/mo and $200/yr.
// Switching preserves assignments, usage/reset timestamps, and re-prices every seat annually.
import { expect, test } from "bun:test";
import type {
	ApiCustomerV5,
	ApiEntityV2,
	AttachParamsV1Input,
} from "@autumn/shared";
import { ApiVersion, BillingInterval, EntityExpand } from "@autumn/shared";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { createVariantPlan } from "@tests/integration/crud/plans/variants/utils/variantTestPlanUtils";
import { listLicenseAssignments } from "@tests/integration/licenses/licenseTestUtils";
import { expectAssignmentPricesCorrect } from "@tests/integration/licenses/utils/expectAssignmentPricesCorrect";
import { expectAssignmentsAnchoredToParent } from "@tests/integration/licenses/utils/expectAssignmentsAnchoredToParent";
import { expectCustomerLicenses } from "@tests/integration/licenses/utils/expectCustomerLicenses";
import { expectLicenseDefinitionCorrect } from "@tests/integration/licenses/utils/expectLicenseDefinitionCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { AutumnRpcCli } from "@/external/autumn/autumnRpcCli";

const MONTHLY_SEAT_PRICE = 20;
const ANNUAL_SEAT_PRICE = 200;
const INCLUDED_MESSAGES = 200;
const SEAT_QUANTITY = 3;
const ENTITY_USAGES = [25, 60, 110] as const;

test(`${chalk.yellowBright("license attach switch: monthly to annual parent preserves entity seat state")}`, async () => {
	const customerId = "attach-parent-customized-license-switch";
	const pro = products.base({
		id: "customized-license-switch-pro",
		items: [items.dashboard()],
	});
	const devSeat = products.base({
		id: "customized-license-switch-dev-seat",
		group: "customized-license-switch-dev-seats",
		items: [items.monthlyMessages({ includedUsage: INCLUDED_MESSAGES })],
	});
	const { ctx, entities, autumnV2_3 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.entities({ count: SEAT_QUANTITY, featureId: TestFeature.Users }),
			s.products({ list: [pro, devSeat] }),
		],
		actions: [],
	});
	const rpc = new AutumnRpcCli({
		secretKey: ctx.orgSecretKey,
		version: ApiVersion.V2_1,
	});
	const annualProId = `${pro.id}-annual`;
	await createVariantPlan({
		rpc,
		basePlanId: pro.id,
		variantPlanId: annualProId,
		name: "Pro Annual",
	});
	await rpc.post("/plans.update", {
		plan_id: pro.id,
		licenses: [
			{
				license_plan_id: devSeat.id,
				included: 0,
				customize: {
					price: {
						amount: MONTHLY_SEAT_PRICE,
						interval: BillingInterval.Month,
					},
				},
			},
		],
	});
	await rpc.post("/plans.update", {
		plan_id: annualProId,
		licenses: [
			{
				license_plan_id: devSeat.id,
				included: 0,
				customize: {
					price: {
						amount: ANNUAL_SEAT_PRICE,
						interval: BillingInterval.Year,
					},
				},
			},
		],
	});

	await autumnV2_3.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: pro.id,
		redirect_mode: "if_required",
		license_quantities: [
			{ license_plan_id: devSeat.id, quantity: SEAT_QUANTITY },
		],
	});
	await autumnV2_3.licenses.attach({
		customer_id: customerId,
		plan_id: devSeat.id,
		entities: entities.map((entity) => ({ entity_id: entity.id })),
	});
	for (let index = 0; index < entities.length; index++) {
		await autumnV2_3.track(
			{
				customer_id: customerId,
				entity_id: entities[index].id,
				feature_id: TestFeature.Messages,
				value: ENTITY_USAGES[index],
			},
			{ timeout: 2000 },
		);
	}

	let customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
	await expectCustomerProducts({
		customer,
		active: [pro.id],
		notPresent: [annualProId, devSeat.id],
	});
	expectCustomerLicenses({
		customer,
		count: 1,
		licenses: [
			{
				license_plan_id: devSeat.id,
				parent_plan_id: pro.id,
				paid_quantity: SEAT_QUANTITY,
				granted: SEAT_QUANTITY,
				usage: SEAT_QUANTITY,
				remaining: 0,
			},
		],
	});
	const monthlyDefinition = await expectLicenseDefinitionCorrect({
		ctx,
		customerId,
		parentPlanId: pro.id,
		isCustom: false,
		basePrice: {
			amount: MONTHLY_SEAT_PRICE,
			interval: BillingInterval.Month,
		},
	});
	await expectAssignmentPricesCorrect({
		ctx,
		customerId,
		amount: MONTHLY_SEAT_PRICE,
		count: SEAT_QUANTITY,
	});
	await expectAssignmentsAnchoredToParent({
		ctx,
		customerId,
		parentPlanId: pro.id,
		count: SEAT_QUANTITY,
	});
	await expectStripeSubscriptionCorrect({ ctx, customerId });

	const assignmentsBefore = await listLicenseAssignments({
		autumn: autumnV2_3,
		customerId,
		licensePlanId: devSeat.id,
		active: true,
	});
	expect(assignmentsBefore).toHaveLength(SEAT_QUANTITY);
	const entityStateBefore = new Map<
		string,
		{ usage: number; remaining: number; nextResetAt: number }
	>();
	for (let index = 0; index < entities.length; index++) {
		const entity = await autumnV2_3.entities.get<ApiEntityV2>(
			customerId,
			entities[index].id,
		);
		const usage = ENTITY_USAGES[index];
		expectBalanceCorrect({
			customer: entity,
			featureId: TestFeature.Messages,
			planId: devSeat.id,
			granted: INCLUDED_MESSAGES,
			remaining: INCLUDED_MESSAGES - usage,
			usage,
		});
		const messages = entity.balances[TestFeature.Messages];
		expect(messages?.next_reset_at).not.toBeNull();
		entityStateBefore.set(entities[index].id, {
			usage,
			remaining: INCLUDED_MESSAGES - usage,
			nextResetAt: messages?.next_reset_at ?? 0,
		});
	}

	await autumnV2_3.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: annualProId,
		redirect_mode: "if_required",
		license_quantities: [
			{ license_plan_id: devSeat.id, quantity: SEAT_QUANTITY },
		],
	});

	customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
	await expectCustomerProducts({
		customer,
		active: [annualProId],
		notPresent: [pro.id, devSeat.id],
	});
	expectCustomerLicenses({
		customer,
		count: 1,
		licenses: [
			{
				license_plan_id: devSeat.id,
				parent_plan_id: annualProId,
				paid_quantity: SEAT_QUANTITY,
				granted: SEAT_QUANTITY,
				usage: SEAT_QUANTITY,
				remaining: 0,
			},
		],
	});
	const annualDefinition = await expectLicenseDefinitionCorrect({
		ctx,
		customerId,
		parentPlanId: annualProId,
		isCustom: false,
		basePrice: {
			amount: ANNUAL_SEAT_PRICE,
			interval: BillingInterval.Year,
		},
	});
	expect(annualDefinition.link_id).toBe(monthlyDefinition.link_id);
	expect(annualDefinition.parent_customer_product_id).not.toBe(
		monthlyDefinition.parent_customer_product_id,
	);
	await expectAssignmentsAnchoredToParent({
		ctx,
		customerId,
		parentPlanId: annualProId,
		count: SEAT_QUANTITY,
	});
	await expectStripeSubscriptionCorrect({ ctx, customerId });

	const assignmentsAfter = await listLicenseAssignments({
		autumn: autumnV2_3,
		customerId,
		licensePlanId: devSeat.id,
		active: true,
	});
	expect(assignmentsAfter).toHaveLength(SEAT_QUANTITY);
	for (const assignment of assignmentsBefore) {
		expect(assignmentsAfter).toContainEqual(
			expect.objectContaining({
				id: assignment.id,
				entity_id: assignment.entity_id,
				license_plan_id: devSeat.id,
				ended_at: null,
			}),
		);
	}

	for (const entity of entities) {
		const stateBefore = entityStateBefore.get(entity.id);
		if (!stateBefore) throw new Error(`Missing state for entity ${entity.id}`);
		const apiEntity = await autumnV2_3.entities.get<ApiEntityV2>(
			customerId,
			entity.id,
			{ expand: [EntityExpand.SubscriptionsPlan] },
		);
		expectBalanceCorrect({
			customer: apiEntity,
			featureId: TestFeature.Messages,
			planId: devSeat.id,
			granted: INCLUDED_MESSAGES,
			remaining: stateBefore.remaining,
			usage: stateBefore.usage,
			nextResetAt: stateBefore.nextResetAt,
			toleranceMs: 0,
		});
		expect(apiEntity.balances[TestFeature.Messages]?.next_reset_at).toBe(
			stateBefore.nextResetAt,
		);
		expect(apiEntity.subscriptions).toContainEqual(
			expect.objectContaining({
				plan_id: devSeat.id,
				plan: expect.objectContaining({
					price: expect.objectContaining({
						amount: ANNUAL_SEAT_PRICE,
						interval: BillingInterval.Year,
					}),
				}),
			}),
		);
		expect(apiEntity.subscriptions).not.toContainEqual(
			expect.objectContaining({
				plan_id: devSeat.id,
				plan: expect.objectContaining({
					price: expect.objectContaining({
						amount: MONTHLY_SEAT_PRICE,
						interval: BillingInterval.Month,
					}),
				}),
			}),
		);
	}

	await expectAssignmentPricesCorrect({
		ctx,
		customerId,
		amount: ANNUAL_SEAT_PRICE,
		count: SEAT_QUANTITY,
	});
});
