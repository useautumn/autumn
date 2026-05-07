import { expect, test } from "bun:test";
import {
	customers,
	entities as entitiesTable,
	type EntityBillingControls,
	type ListEntitiesResponse,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import chalk from "chalk";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { handleListEntitiesV2 } from "@/internal/entities/handlers/handleListEntitiesV2.js";
import { generateId } from "@/utils/genUtils.js";

const createEntityListApp = (): Hono<HonoEnv> => {
	const app = new Hono<HonoEnv>();
	app.use("*", async (honoContext, next) => {
		honoContext.set("ctx", ctx);
		await next();
	});
	app.post("/entities.list", ...handleListEntitiesV2);
	return app;
};

const listEntities = async ({
	customerId,
	limit,
	offset,
}: {
	customerId: string;
	limit?: number;
	offset?: number;
}): Promise<ListEntitiesResponse> => {
	const response = await createEntityListApp().request("/entities.list", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			customer_id: customerId,
			limit,
			offset,
		}),
	});
	expect(response.status).toBe(200);
	return (await response.json()) as ListEntitiesResponse;
};

const deleteSeededCustomer = async ({
	customerId,
}: {
	customerId: string;
}): Promise<void> => {
	await ctx.db
		.delete(customers)
		.where(
			and(
				eq(customers.id, customerId),
				eq(customers.org_id, ctx.org.id),
				eq(customers.env, ctx.env),
			),
		);
};

const seedCustomerWithEntities = async ({
	customerId,
	entityInputs,
}: {
	customerId: string;
	entityInputs: {
		id: string;
		name: string;
		billingControls?: EntityBillingControls;
	}[];
}): Promise<void> => {
	const feature = ctx.features.find(
		(candidate) => candidate.id === TestFeature.Users,
	);
	if (!feature) {
		throw new Error(`Feature ${TestFeature.Users} not found`);
	}
	const internalCustomerId = generateId("cus");
	await deleteSeededCustomer({ customerId });
	await ctx.db.insert(customers).values({
		internal_id: internalCustomerId,
		org_id: ctx.org.id,
		id: customerId,
		env: ctx.env,
		created_at: Date.now(),
	});
	await ctx.db.insert(entitiesTable).values(
		entityInputs.map((entityInput) => ({
			id: entityInput.id,
			name: entityInput.name,
			internal_id: generateId("ety"),
			internal_customer_id: internalCustomerId,
			internal_feature_id: feature.internal_id,
			feature_id: feature.id,
			org_id: ctx.org.id,
			env: ctx.env,
			created_at: Date.now(),
			deleted: false,
			spend_limits: entityInput.billingControls?.spend_limits,
			usage_alerts: entityInput.billingControls?.usage_alerts,
			overage_allowed: entityInput.billingControls?.overage_allowed,
		})),
	);
};

test(`${chalk.yellowBright("entities.list: returns lightweight entities for a customer")}`, async () => {
	const customerId = "list-entities-basic";
	const billingControls: EntityBillingControls = {
		spend_limits: [
			{
				feature_id: TestFeature.Messages,
				enabled: true,
				overage_limit: 25,
			},
		],
	};
	await seedCustomerWithEntities({
		customerId,
		entityInputs: [
			{ id: "ent-1", name: "Entity 1" },
			{ id: "ent-2", name: "Entity 2" },
			{
				id: "ent-with-controls",
				name: "Entity With Controls",
				billingControls,
			},
		],
	});
	try {
		const response = await listEntities({ customerId });
		const actualEntityIds = response.list.map((entity) => entity.id).sort();
		const entityWithControls = response.list.find(
			(entity) => entity.id === "ent-with-controls",
		);
		expect(response.total).toBe(3);
		expect(response.total_count).toBe(3);
		expect(response.total_filtered_count).toBe(3);
		expect(response.offset).toBe(0);
		expect(response.limit).toBe(10);
		expect(response.has_more).toBe(false);
		expect(actualEntityIds).toEqual(["ent-1", "ent-2", "ent-with-controls"]);
		expect(entityWithControls?.customer_id).toBe(customerId);
		expect(entityWithControls?.billing_controls?.spend_limits).toEqual(
			billingControls.spend_limits,
		);
		expect(
			"subscriptions" in
				((entityWithControls ?? {}) as Record<string, unknown>),
		).toBe(false);
	} finally {
		await deleteSeededCustomer({ customerId });
	}
});

test(`${chalk.yellowBright("entities.list: enforces requested limit and reports has_more")}`, async () => {
	const customerId = "list-entities-limit";
	await seedCustomerWithEntities({
		customerId,
		entityInputs: [
			{ id: "ent-limit-1", name: "Entity Limit 1" },
			{ id: "ent-limit-2", name: "Entity Limit 2" },
			{ id: "ent-limit-3", name: "Entity Limit 3" },
		],
	});
	try {
		const response = await listEntities({
			customerId,
			limit: 1,
			offset: 1,
		});
		expect(response.total).toBe(1);
		expect(response.total_count).toBe(3);
		expect(response.total_filtered_count).toBe(3);
		expect(response.offset).toBe(1);
		expect(response.limit).toBe(1);
		expect(response.list).toHaveLength(1);
		expect(response.has_more).toBe(true);
	} finally {
		await deleteSeededCustomer({ customerId });
	}
});
