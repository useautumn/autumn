import { expect, test } from "bun:test";
import { AppEnv, RELEVANT_STATUSES } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { sql } from "drizzle-orm";
import { getFullCusQuery } from "@/internal/customers/getFullCusQuery.js";

type PlanNode = {
	"Relation Name"?: string;
	"Actual Loops"?: number;
	Plans?: PlanNode[];
};

const maxLoopsOnRelation = ({
	node,
	relation,
}: {
	node: PlanNode;
	relation: string;
}): number =>
	Math.max(
		node["Relation Name"] === relation ? (node["Actual Loops"] ?? 0) : 0,
		...(node.Plans ?? []).map((child) =>
			maxLoopsOnRelation({ node: child, relation }),
		),
	);

const ENTITY_COUNT = 8;
const CUS_PRODUCT_LIMIT = 3;

test.concurrent(
	`${chalk.yellowBright("getFull hydrates entitlements only for the returned customer products")}`,
	async () => {
		const customerId = "get-full-hydrates-page-only";
		const seat = products.base({
			id: "page-only-seat",
			items: [items.monthlyMessages({ includedUsage: 100 }), items.dashboard()],
		});

		const { ctx, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [seat] }),
				s.entities({ count: ENTITY_COUNT, featureId: TestFeature.Users }),
			],
			actions: Array.from({ length: ENTITY_COUNT }, (_, entityIndex) =>
				s.billing.attach({ productId: seat.id, entityIndex }),
			),
		});

		const query = ({ entityId }: { entityId?: string }) =>
			getFullCusQuery({
				idOrInternalId: customerId,
				orgId: ctx.org.id,
				env: AppEnv.Sandbox,
				inStatuses: RELEVANT_STATUSES,
				includeInvoices: false,
				withEntities: true,
				withTrialsUsed: false,
				withSubs: false,
				withEvents: false,
				entityId,
				cusProductLimit: CUS_PRODUCT_LIMIT,
			});

		for (const entityId of [undefined, entities[ENTITY_COUNT - 1].id]) {
			const [row] = await ctx.db.execute(
				sql`EXPLAIN (ANALYZE, FORMAT JSON) ${query({ entityId })}`,
			);
			const [{ Plan: plan }] = Object.values(row)[0] as [{ Plan: PlanNode }];

			expect(
				maxLoopsOnRelation({ node: plan, relation: "customer_entitlements" }),
			).toBeLessThanOrEqual(CUS_PRODUCT_LIMIT);

			const [result] = await ctx.db.execute(query({ entityId }));
			const customerProducts = result.customer_products as {
				entity_id: string | null;
				customer_entitlements: unknown[];
			}[];
			expect(customerProducts).toHaveLength(CUS_PRODUCT_LIMIT);
			for (const customerProduct of customerProducts) {
				expect(customerProduct.customer_entitlements).toHaveLength(2);
			}
			if (entityId) expect(customerProducts[0].entity_id).toBe(entityId);
		}
	},
);
