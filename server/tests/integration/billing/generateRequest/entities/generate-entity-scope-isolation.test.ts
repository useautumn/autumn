/**
 * Contract: a generated request anchored to ONE entity must not disturb the
 * customer's other entities or their schedules.
 *
 * The generation context carries every current plan with its entity_id, and
 * update_subscription pins the anchor from customer_product_id — so a request
 * that reaches a sibling entity is a scoping failure, not a model preference.
 *
 * Cases:
 *   1. update anchored to entity 1 -> entity 2's plan, balance and status all
 *      unchanged
 *   2. an entity holds a scoped add-on the schedule never names; a generated
 *      customer-level schedule must leave that entity plan in place
 *
 * Note: createSchedule deliberately replaces ALL of a customer's schedule rows
 * (persistCreateSchedule: "a customer holds one schedule"), so the invariant a
 * generated schedule owes is about the entity's PLANS, not its schedule row.
 *
 * Requires ANTHROPIC_API_KEY on the server under test.
 */

import { expect, test } from "bun:test";
import type {
	ApiCustomerV5,
	ApiEntityV2,
	CreateScheduleParamsV0Input,
	UpdateSubscriptionV0Params,
} from "@autumn/shared";
import { CusProductStatus, ms } from "@autumn/shared";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService.js";

const GENERATE_PATH = "/agent.generate_billing_request";
const LLM_TEST_TIMEOUT = 180_000;

const MESSAGES_GRANT = 100;
const RAISED_MESSAGES_GRANT = 400;
const ADD_ON_WORDS = 25;

test.concurrent(
	`${chalk.yellowBright("generate entities: an anchored update leaves the sibling entity untouched")}`,
	async () => {
		const customerId = "gen-entity-anchor";
		const plan = products.pro({
			id: `${customerId}-plan`,
			items: [items.monthlyMessages({ includedUsage: MESSAGES_GRANT })],
		});

		const { autumnV1, autumnV2_2, ctx, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
				s.products({ list: [plan] }),
			],
			actions: [
				s.billing.attach({ productId: plan.id, entityIndex: 0 }),
				s.billing.attach({ productId: plan.id, entityIndex: 1 }),
			],
		});

		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			withEntities: true,
		});
		const customerProductFor = (entityId: string) => {
			const match = fullCustomer.customer_products.find(
				(customerProduct) => customerProduct.entity_id === entityId,
			);
			if (!match) throw new Error(`No customer product for entity ${entityId}`);
			return match;
		};
		const anchored = customerProductFor(entities[0]!.id);
		const sibling = customerProductFor(entities[1]!.id);

		const generated = (await autumnV2_2.post(GENERATE_PATH, {
			customer_id: customerId,
			customer_product_id: anchored.id,
			prompt: `Raise their included messages to ${RAISED_MESSAGES_GRANT}.`,
			tool: "update_subscription",
		})) as { request: Record<string, unknown>; unrepresentable: string[] };

		// ── The generated request stays pinned to the anchored product ──────
		expect(generated.request.customer_product_id).toBe(anchored.id);
		expect(generated.request.customer_id).toBe(customerId);

		await autumnV1.subscriptions.update<UpdateSubscriptionV0Params>({
			...(generated.request as UpdateSubscriptionV0Params),
			entity_id: entities[0]!.id,
		});

		// ── The anchored entity got the change ─────────────────────────────
		const anchoredEntity = await autumnV2_2.entities.get<ApiEntityV2>(
			customerId,
			entities[0]!.id,
			{ skip_cache: "true" },
		);
		expectBalanceCorrect({
			customer: anchoredEntity,
			featureId: TestFeature.Messages,
			granted: RAISED_MESSAGES_GRANT,
			remaining: RAISED_MESSAGES_GRANT,
			usage: 0,
		});

		// ── The sibling entity is byte-for-byte where it was ───────────────
		const siblingEntity = await autumnV2_2.entities.get<ApiEntityV2>(
			customerId,
			entities[1]!.id,
			{ skip_cache: "true" },
		);
		expectBalanceCorrect({
			customer: siblingEntity,
			featureId: TestFeature.Messages,
			granted: MESSAGES_GRANT,
			remaining: MESSAGES_GRANT,
			usage: 0,
		});

		const fullCustomerAfter = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			withEntities: true,
		});
		const siblingAfter = fullCustomerAfter.customer_products.find(
			(customerProduct) => customerProduct.id === sibling.id,
		);
		expect(siblingAfter?.status).toBe(sibling.status);
		expect(siblingAfter?.internal_entity_id).toBe(sibling.internal_entity_id);
	},
	LLM_TEST_TIMEOUT,
);

test.concurrent(
	`${chalk.yellowBright("generate entities: a generated customer schedule preserves the entity's scoped add-on")}`,
	async () => {
		const customerId = "gen-entity-schedules";
		const pro = products.pro({
			id: `${customerId}-pro`,
			items: [items.monthlyMessages({ includedUsage: MESSAGES_GRANT })],
		});
		const premium = products.premium({
			id: `${customerId}-premium`,
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});
		const addOn = products.recurringAddOn({
			id: `${customerId}-addon`,
			items: [items.monthlyWords({ includedUsage: ADD_ON_WORDS })],
		});

		const { autumnV1, autumnV2_2, ctx, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
				s.products({ list: [pro, premium, addOn] }),
			],
			actions: [],
		});

		const entityId = entities[0]!.id;
		const now = Date.now();

		// The entity holds a scoped add-on that no schedule phase ever names.
		await autumnV2_2.billing.attach({
			customer_id: customerId,
			entity_id: entityId,
			plan_id: addOn.id,
		});

		await autumnV1.billing.createSchedule<CreateScheduleParamsV0Input>({
			customer_id: customerId,
			phases: [
				{ starts_at: now, plans: [{ plan_id: pro.id }] },
				{ starts_at: now + ms.days(30), plans: [{ plan_id: pro.id }] },
			],
		});

		const generated = (await autumnV2_2.post(GENERATE_PATH, {
			customer_id: customerId,
			prompt: `Keep them on the ${pro.id} plan now, then move them to the ${premium.id} plan in 30 days. Do not touch anything scoped to an entity.`,
			tool: "create_schedule",
		})) as { request: Record<string, unknown>; unrepresentable: string[] };

		// ── The generated schedule is customer-scoped and never names the add-on
		expect(generated.request.entity_id).toBeUndefined();
		const generatedPhases = generated.request.phases as {
			plans: { plan_id: string; entity_id?: string | null }[];
		}[];
		expect(generatedPhases.length).toBeGreaterThan(1);
		expect(
			generatedPhases
				.flatMap(({ plans }) => plans)
				.map(({ plan_id }) => plan_id),
		).not.toContain(addOn.id);

		await autumnV1.billing.createSchedule<CreateScheduleParamsV0Input>(
			generated.request as CreateScheduleParamsV0Input,
		);

		// ── The entity's add-on and its balance survived ───────────────────
		const entity = await autumnV2_2.entities.get<ApiEntityV2>(
			customerId,
			entityId,
			{ skip_cache: "true" },
		);
		expectBalanceCorrect({
			customer: entity,
			featureId: TestFeature.Words,
			granted: ADD_ON_WORDS,
			remaining: ADD_ON_WORDS,
			usage: 0,
		});

		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			withEntities: true,
		});
		const entityAddOn = fullCustomer.customer_products.find(
			(customerProduct) =>
				customerProduct.product.id === addOn.id &&
				customerProduct.entity_id === entityId,
		);
		expect(entityAddOn?.status).toBe(CusProductStatus.Active);

		// ── The customer-level schedule the prompt asked for exists ────────
		const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId, {
			skip_cache: "true",
		});
		expect(
			customer.subscriptions.some(
				(subscription) => subscription.plan_id === pro.id,
			),
		).toBe(true);
	},
	LLM_TEST_TIMEOUT,
);
