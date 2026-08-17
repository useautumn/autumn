import { expect, test } from "bun:test";
import type {
	ApiEntityV0,
	AttachPreviewResponse,
	CreateScheduleParamsV0Input,
} from "@autumn/shared";
import { customerProducts } from "@autumn/shared";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectNoStripeSubscription } from "@tests/integration/billing/utils/expectNoStripeSubscription";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { expectSubCount } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { inArray } from "drizzle-orm";

const immediateSchedule = ({
	customerId,
	entityId,
	plans,
}: {
	customerId: string;
	entityId?: string;
	plans: CreateScheduleParamsV0Input["phases"][number]["plans"];
}): CreateScheduleParamsV0Input => ({
	customer_id: customerId,
	entity_id: entityId,
	preserve_add_ons: true,
	phases: [{ starts_at: "now", plans }],
});

test.concurrent(
	`${chalk.yellowBright("create-schedule immediate multi-plan: inherits, overrides, and clears plan scope")}`,
	async () => {
		const inheritedPlan = products.base({
			id: "inherited",
			group: "inherited",
			items: [items.monthlyMessages()],
		});
		const customerPlan = products.base({
			id: "customer",
			group: "customer",
			items: [items.monthlyWords()],
		});
		const explicitPlan = products.base({
			id: "explicit",
			group: "inherited",
			items: [items.dashboard()],
		});
		const previousExplicitPlan = products.base({
			id: "previous-explicit",
			group: "inherited",
			items: [items.monthlyUsers()],
		});
		const existingAddon = products.base({
			id: "existing-addon",
			group: "existing-addon",
			isAddOn: true,
			items: [items.monthlyCredits()],
		});
		const { customerId, autumnV1, ctx, entities } = await initScenario({
			customerId: "cs-immediate-plan-scopes",
			setup: [
				s.customer({}),
				s.products({
					list: [
						inheritedPlan,
						customerPlan,
						explicitPlan,
						previousExplicitPlan,
						existingAddon,
					],
				}),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.billing.attach({
					productId: previousExplicitPlan.id,
					entityIndex: 1,
				}),
				s.billing.attach({ productId: existingAddon.id, entityIndex: 1 }),
			],
		});

		const response = await autumnV1.billing.createSchedule(
			immediateSchedule({
				customerId,
				entityId: entities[0].id,
				plans: [
					{ plan_id: inheritedPlan.id },
					{ plan_id: customerPlan.id, entity_id: null },
					{ plan_id: explicitPlan.id, entity_id: entities[1].id },
				],
			}),
		);

		const [entity0, entity1, phaseCustomerProducts] = await Promise.all([
			autumnV1.entities.get<ApiEntityV0>(customerId, entities[0].id),
			autumnV1.entities.get<ApiEntityV0>(customerId, entities[1].id),
			ctx.db
				.select()
				.from(customerProducts)
				.where(
					inArray(
						customerProducts.id,
						response.phases[0]?.customer_product_ids ?? [],
					),
				),
		]);
		const scopeByProductId = new Map(
			phaseCustomerProducts.map(({ product_id, entity_id }) => [
				product_id,
				entity_id,
			]),
		);
		expect(scopeByProductId.get(inheritedPlan.id)).toBe(entities[0].id);
		expect(scopeByProductId.get(customerPlan.id)).toBeNull();
		expect(scopeByProductId.get(explicitPlan.id)).toBe(entities[1].id);
		expect(scopeByProductId.get(existingAddon.id)).toBe(entities[1].id);
		await expectCustomerProducts({
			customer: entity0,
			active: [inheritedPlan.id, customerPlan.id],
			notPresent: [explicitPlan.id, previousExplicitPlan.id, existingAddon.id],
		});
		await expectCustomerProducts({
			customer: entity1,
			active: [customerPlan.id, explicitPlan.id, existingAddon.id],
			notPresent: [inheritedPlan.id, previousExplicitPlan.id],
		});
		await expectNoStripeSubscription({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("create-schedule immediate multi-plan: repeats the same plans on sibling entities")}`,
	async () => {
		const plan = products.pro({
			id: "repeated-plan",
			items: [items.monthlyMessages()],
		});
		const addon = products.recurringAddOn({
			id: "repeated-addon",
			items: [items.monthlyWords()],
		});
		const { customerId, autumnV1, ctx, entities } = await initScenario({
			customerId: "cs-repeat-entity-plans",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [plan, addon] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [],
		});

		for (const entity of entities) {
			await autumnV1.billing.createSchedule(
				immediateSchedule({
					customerId,
					entityId: entity.id,
					plans: [{ plan_id: plan.id }, { plan_id: addon.id }],
				}),
			);
		}

		const [entity0, entity1] = await Promise.all([
			autumnV1.entities.get<ApiEntityV0>(customerId, entities[0].id),
			autumnV1.entities.get<ApiEntityV0>(customerId, entities[1].id),
		]);
		for (const entity of [entity0, entity1]) {
			await expectCustomerProducts({
				customer: entity,
				active: [plan.id, addon.id],
			});
		}
		await expectSubCount({ ctx, customerId, count: 1 });
		await expectStripeSubscriptionCorrect({ ctx, customerId });
	},
);

test.concurrent(
	`${chalk.yellowBright("create-schedule immediate multi-plan: leaves the unrepresented request scope unchanged")}`,
	async () => {
		const existingPlan = products.base({
			id: "unrepresented-existing",
			group: "unrepresented-existing",
			items: [items.monthlyMessages()],
		});
		const attachedPlan = products.base({
			id: "override-scope-plan",
			group: "override-scope-plan",
			items: [items.monthlyWords()],
		});
		const { customerId, autumnV1, entities } = await initScenario({
			customerId: "cs-unrepresented-request-scope",
			setup: [
				s.customer({}),
				s.products({ list: [existingPlan, attachedPlan] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.billing.attach({ productId: existingPlan.id, entityIndex: 0 }),
			],
		});

		await autumnV1.billing.createSchedule(
			immediateSchedule({
				customerId,
				entityId: entities[0].id,
				plans: [{ plan_id: attachedPlan.id, entity_id: entities[1].id }],
			}),
		);

		const [entity0, entity1] = await Promise.all([
			autumnV1.entities.get<ApiEntityV0>(customerId, entities[0].id),
			autumnV1.entities.get<ApiEntityV0>(customerId, entities[1].id),
		]);
		await expectCustomerProducts({
			customer: entity0,
			active: [existingPlan.id],
			notPresent: [attachedPlan.id],
		});
		await expectCustomerProducts({
			customer: entity1,
			active: [attachedPlan.id],
			notPresent: [existingPlan.id],
		});
	},
);

// Regression: add-on-only phases previously expired base plans in represented scopes.
test.concurrent(
	`${chalk.yellowBright("create-schedule immediate multi-plan: add-ons preserve base plans across scopes")}`,
	async () => {
		const basePlan = products.pro({
			id: "addon-only-base",
			items: [items.monthlyMessages()],
		});
		const addon = products.base({
			id: "addon-only-addon",
			isAddOn: true,
			items: [items.dashboard()],
		});
		const { customerId, autumnV1, ctx, entities } = await initScenario({
			customerId: "cs-addon-only-preserves-bases-v1",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [basePlan, addon] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.billing.attach({ productId: basePlan.id, entityIndex: 0 }),
				s.billing.attach({ productId: basePlan.id, entityIndex: 1 }),
			],
		});
		const params = immediateSchedule({
			customerId,
			plans: entities.map((entity) => ({
				plan_id: addon.id,
				entity_id: entity.id,
			})),
		});

		const preview = (await autumnV1.post(
			"/billing.preview_create_schedule",
			params,
		)) as AttachPreviewResponse;
		expect(preview.outgoing).toHaveLength(0);
		expect(preview.total).toBe(0);

		const response = await autumnV1.billing.createSchedule(params);
		// Only the two attached add-ons; the untouched base plans join no phase.
		expect(response.phases[0]?.customer_product_ids).toHaveLength(2);
		for (const entity of entities) {
			const entityCustomer = await autumnV1.entities.get<ApiEntityV0>(
				customerId,
				entity.id,
			);
			await expectCustomerProducts({
				customer: entityCustomer,
				active: [basePlan.id, addon.id],
			});
		}
		await expectStripeSubscriptionCorrect({ ctx, customerId });
	},
);

test.concurrent(
	`${chalk.yellowBright("create-schedule immediate multi-plan: rejects scopes on separate subscriptions")}`,
	async () => {
		const base = products.base({
			id: "separate-sub-base",
			items: [items.monthlyPrice({ price: 10 })],
		});
		const addOn = products.recurringAddOn({
			id: "separate-sub-addon",
			items: [items.monthlyWords()],
		});
		const { customerId, autumnV1, entities, ctx } = await initScenario({
			customerId: "cs-immediate-separate-sub-scopes",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [base, addOn] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.billing.attach({ productId: base.id, entityIndex: 0 }),
				s.billing.attach({
					productId: base.id,
					entityIndex: 1,
					newBillingSubscription: true,
				}),
			],
		});

		await expectAutumnError({
			errMessage: "multiple existing subscriptions",
			func: () =>
				autumnV1.billing.createSchedule(
					immediateSchedule({
						customerId,
						plans: entities.map((entity) => ({
							plan_id: addOn.id,
							entity_id: entity.id,
						})),
					}),
				),
		});

		for (const entity of entities) {
			const scopedCustomer = await autumnV1.entities.get<ApiEntityV0>(
				customerId,
				entity.id,
			);
			await expectCustomerProducts({
				customer: scopedCustomer,
				active: [base.id],
				notPresent: [addOn.id],
			});
		}
		await expectSubCount({ ctx, customerId, count: 2 });
	},
);
