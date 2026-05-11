/**
 * TDD test for entities.list.
 *
 * Contract under test:
 *   New endpoints:
 *     - POST /v1/entities.list -> page-paginated full entity responses.
 *   New behaviors:
 *     - search matches entity id/name only, not parent customer fields.
 *     - plan filters include inherited customer-level products.
 *     - plan filters include matching entity-level products only for that entity.
 *     - trialing entity products are returned in full entity list responses.
 *     - subscription_status alone shapes hydrated products but does not reduce entity selection.
 *   Side effects:
 *     - none; endpoint is read-only.
 *
 * Pre-impl red: the RPC route and list handler do not exist.
 * Post-impl green: all assertions pass through the FullSubject-backed entity list path.
 */

import { expect, test } from "bun:test";
import {
	type ApiEntityV1,
	ApiEntityV1Schema,
	type ApiEntityV2,
	type PagePaginatedResponse,
} from "@autumn/shared";
import { ApiEntityV2Schema } from "@shared/api/entities/apiEntityV2.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

type ListEntitiesResponse<T> = PagePaginatedResponse<T> & {
	total_count: number;
	total_filtered_count: number;
};

test.concurrent(`${chalk.yellowBright("list entities: filters inherited and entity-level plans with trial entities")}`, async () => {
	const customerId = "list-entities-contract";
	const entityPrefix = `${customerId}-entity`;
	const alphaEntityId = `${entityPrefix}-alpha`;
	const betaEntityId = `${entityPrefix}-beta`;
	const gammaEntityId = `${entityPrefix}-gamma`;
	const customerOnlyNeedle = "list-entities-customer-only-needle";

	const inheritedProduct = products.base({
		id: "list-inherited",
		items: [items.dashboard(), items.monthlyMessages({ includedUsage: 100 })],
	});
	const trialEntityProduct = products.baseWithTrial({
		id: "list-trial-entity",
		trialDays: 7,
		cardRequired: false,
		items: [items.monthlyCredits({ includedUsage: 200 })],
	});
	const regularEntityProduct = products.base({
		id: "list-regular-entity",
		items: [items.monthlyCredits({ includedUsage: 50 })],
	});

	const { autumnV1, autumnV2, autumnV2_1 } = await initScenario({
		customerId,
		setup: [
			s.customer({
				name: customerOnlyNeedle,
			}),
			s.products({
				list: [inheritedProduct, trialEntityProduct, regularEntityProduct],
			}),
		],
		actions: [s.billing.attach({ productId: inheritedProduct.id })],
	});

	await autumnV2_1.entitiesV2.create({
		customer_id: customerId,
		entity_id: alphaEntityId,
		feature_id: TestFeature.Users,
		name: "List Entities Alpha",
	});
	await autumnV2_1.entitiesV2.create({
		customer_id: customerId,
		entity_id: betaEntityId,
		feature_id: TestFeature.Users,
		name: "List Entities Beta Trial",
	});
	await autumnV2_1.entitiesV2.create({
		customer_id: customerId,
		entity_id: gammaEntityId,
		feature_id: TestFeature.Users,
		name: "List Entities Gamma",
	});

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: trialEntityProduct.id,
		entity_id: betaEntityId,
	});
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: regularEntityProduct.id,
		entity_id: gammaEntityId,
	});

	// Contract: full V2.1 entity responses, pagination, and entity-only search.
	const firstPage = await autumnV2_1.entitiesV2.list<
		ListEntitiesResponse<ApiEntityV2>
	>({
		search: entityPrefix,
		limit: 2,
		offset: 0,
		keepInternalFields: true,
	});
	expect(firstPage.total).toBe(2);
	expect(firstPage.limit).toBe(2);
	expect(firstPage.offset).toBe(0);
	expect(firstPage.has_more).toBe(true);
	expect(firstPage.total_filtered_count).toBe(3);
	expect(firstPage.total_count).toBeGreaterThanOrEqual(3);
	for (const entity of firstPage.list) {
		ApiEntityV2Schema.parse(entity);
		expect(entity.customer_id).toBe(customerId);
	}

	const customerSearch = await autumnV2_1.entitiesV2.list<
		ListEntitiesResponse<ApiEntityV2>
	>({
		search: customerOnlyNeedle,
		keepInternalFields: true,
	});
	expect(customerSearch.total).toBe(0);
	expect(customerSearch.total_filtered_count).toBe(0);

	// Contract: inherited customer-level product makes all three entities match.
	const inheritedPlanPage = await autumnV2_1.entitiesV2.list<
		ListEntitiesResponse<ApiEntityV2>
	>({
		search: entityPrefix,
		plans: [{ id: inheritedProduct.id }],
		limit: 3,
		keepInternalFields: true,
	});
	expect(inheritedPlanPage.total).toBe(3);
	expect(inheritedPlanPage.total_filtered_count).toBe(3);
	expect(inheritedPlanPage.has_more).toBe(false);
	expect(inheritedPlanPage.list.map((entity) => entity.id).sort()).toEqual([
		alphaEntityId,
		betaEntityId,
		gammaEntityId,
	]);

	// Contract: entity-level product only matches its owning entity, including trial products.
	const trialPlanPage = await autumnV2_1.entitiesV2.list<
		ListEntitiesResponse<ApiEntityV2>
	>({
		search: entityPrefix,
		plans: [{ id: trialEntityProduct.id }],
		keepInternalFields: true,
	});
	expect(trialPlanPage.total).toBe(1);
	expect(trialPlanPage.total_filtered_count).toBe(1);
	const trialEntity = trialPlanPage.list[0];
	ApiEntityV2Schema.parse(trialEntity);
	expect(trialEntity.id).toBe(betaEntityId);
	const trialSubscription = trialEntity.subscriptions.find(
		(subscription) => subscription.plan_id === trialEntityProduct.id,
	);
	expect(trialSubscription).toBeDefined();
	expect(trialSubscription?.trial_ends_at).toBeNumber();
	expect(trialEntity.balances[TestFeature.Credits]).toMatchObject({
		remaining: 200,
		usage: 0,
	});

	// Contract: subscription_status alone does not reduce selected entities.
	const scheduledOnlySelection = await autumnV2_1.entitiesV2.list<
		ListEntitiesResponse<ApiEntityV2>
	>({
		search: entityPrefix,
		subscription_status: "scheduled",
		limit: 10,
		keepInternalFields: true,
	});
	expect(scheduledOnlySelection.total).toBe(3);
	expect(scheduledOnlySelection.total_filtered_count).toBe(3);

	// Contract: response versioning applies to each listed entity.
	await timeout(1100);
	const v2_0Page = await autumnV2.entitiesV2.list<
		ListEntitiesResponse<ApiEntityV1>
	>({
		search: betaEntityId,
		keepInternalFields: true,
	});
	expect(v2_0Page.total).toBe(1);
	ApiEntityV1Schema.parse(v2_0Page.list[0]);
	expect(v2_0Page.list[0].id).toBe(betaEntityId);
});
