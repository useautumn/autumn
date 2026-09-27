import { expect } from "bun:test";
import {
	type UpdateSubscriptionV1ParamsInput,
	UpdateSubscriptionV1ParamsSchema,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { computeUpdateSubscriptionPlan } from "@/internal/billing/v2/actions/updateSubscription/compute/computeUpdateSubscriptionPlan.js";
import { setupUpdateSubscriptionBillingContext } from "@/internal/billing/v2/actions/updateSubscription/setup/setupUpdateSubscriptionBillingContext.js";
import { persistCustomerLicenseTransitions } from "@/internal/billing/v2/execute/executeAutumnActions/persistCustomerLicenseTransitions.js";
import { executeAutumnBillingPlan } from "@/internal/billing/v2/execute/executeAutumnBillingPlan.js";
import { invalidateCachedFullSubject } from "@/internal/customers/cache/fullSubject/index.js";
import { generateId } from "@/utils/genUtils.js";
import { expectLicensePooledIdentityCorrect } from "./expectLicensePooledIdentityCorrect.js";
import {
	expectLicensePooledGrant,
	expectLicensePrivateSeatGrant,
	parentPlan,
	seatLinkId,
} from "./licensePooledBalanceTestUtils.js";

export const persistPooledBatchTransition = async ({
	ctx,
	params: input,
}: {
	ctx: AutumnContext;
	params: UpdateSubscriptionV1ParamsInput;
}) => {
	const params = UpdateSubscriptionV1ParamsSchema.parse(input);
	const billingContext = await setupUpdateSubscriptionBillingContext({
		ctx,
		params,
	});
	const plan = await computeUpdateSubscriptionPlan({
		ctx,
		params,
		billingContext,
	});
	expect(plan.customerLicenseTransitions).toHaveLength(1);
	const transition = plan.customerLicenseTransitions?.[0];
	if (!transition) throw new Error("Expected an assigned-seat transition");

	await executeAutumnBillingPlan({
		ctx,
		autumnBillingPlan: { ...plan, customerLicenseTransitions: [] },
	});
	await persistCustomerLicenseTransitions({
		ctx,
		customerLicenseTransitions: [transition],
	});
	await invalidateCachedFullSubject({ ctx, customerId: params.customer_id });
	return transition;
};

export const setupPooledBatchTransition = async ({
	idPrefix,
	entityCount = 1,
}: {
	idPrefix: string;
	entityCount?: number;
}) => {
	const customerId = `${idPrefix}-customer`;
	const parent = parentPlan({ id: `${idPrefix}-parent` });
	const seat = products.base({
		id: `${idPrefix}-seat`,
		items: [items.dashboard(), items.monthlyWords({ includedUsage: 100 })],
	});
	const { autumnV1, autumnV2_4, ctx, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
			s.products({ list: [parent, seat] }),
		],
		actions: [
			s.licenses.link({
				parentProductId: parent.id,
				licenseProductId: seat.id,
				included: 1,
			}),
			s.billing.attach({ productId: parent.id }),
			s.licenses.assign({ licenseProductId: seat.id, entityIndex: 0 }),
		],
	});
	if (entityCount > 1) {
		await autumnV1.entities.create(
			customerId,
			Array.from({ length: entityCount - 1 }, (_, index) => ({
				id: `${idPrefix}-extra-${index}`,
				feature_id: TestFeature.Users,
			})),
		);
	}
	const customerLicenseLinkId = await seatLinkId({
		db: ctx.db,
		customerId,
		licenseProductId: seat.id,
	});
	const transition = await persistPooledBatchTransition({
		ctx,
		params: {
			customer_id: customerId,
			plan_id: parent.id,
			customize: {
				upsert_licenses: [
					{
						license_plan_id: seat.id,
						customize: {
							remove_items: [{ feature_id: TestFeature.Words }],
							add_items: [
								{
									...itemsV2.monthlyMessages({ included: 1000 }),
									pooled: true,
								},
							],
						},
					},
				],
			},
		},
	});

	await expectLicensePrivateSeatGrant({
		autumn: autumnV2_4,
		customerId,
		entityIds: [entities[0].id],
		featureId: TestFeature.Words,
		grant: 100,
	});
	await expectLicensePooledGrant({
		autumn: autumnV2_4,
		ctx,
		customerId,
		customerLicenseLinkId,
		grantPerSeat: 1000,
		seatCount: 1,
		contributionCount: 0,
	});
	const pool = await expectLicensePooledIdentityCorrect({
		ctx,
		customerId,
		customerLicenseLinkId,
	});
	expect(Object.values(transition.pooledBalanceIds ?? {})).toEqual([pool.id]);

	return {
		autumn: autumnV2_4,
		ctx,
		customerId,
		entityId: entities[0].id,
		parentPlanId: parent.id,
		licensePlanId: seat.id,
		customerLicenseLinkId,
		pool,
		transition,
		executionScope: {
			batchTransitionId: generateId("batch_transition"),
			assignmentCutoffMs: Date.now(),
		},
	};
};
