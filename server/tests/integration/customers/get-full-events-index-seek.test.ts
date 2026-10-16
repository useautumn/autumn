import { expect, test } from "bun:test";
import { customers, events, RELEVANT_STATUSES } from "@autumn/shared";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { and, eq, sql } from "drizzle-orm";
import { getFullCusQuery } from "@/internal/customers/getFullCusQuery.js";
import { generateId } from "@/utils/genUtils.js";

type PlanNode = {
	"Relation Name"?: string;
	"Index Cond"?: string;
	Plans?: PlanNode[];
};

const findRelationNodes = ({
	node,
	relation,
}: {
	node: PlanNode;
	relation: string;
}): PlanNode[] => [
	...(node["Relation Name"] === relation ? [node] : []),
	...(node.Plans ?? []).flatMap((child) =>
		findRelationNodes({ node: child, relation }),
	),
];

test.concurrent(
	`${chalk.yellowBright("getFull with events seeks the customer's events by index")}`,
	async () => {
		const customerId = `get-full-events-seek-${Math.random().toString(36).slice(2, 9)}`;
		const { ctx } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false })],
			actions: [],
		});
		const { db } = ctx;

		const customer = await db.query.customers.findFirst({
			where: and(
				eq(customers.id, customerId),
				eq(customers.org_id, ctx.org.id),
				eq(customers.env, ctx.env),
			),
		});
		if (!customer) throw new Error("Customer not found");

		const eventId = generateId("evt");
		await db.insert(events).values({
			id: eventId,
			org_id: ctx.org.id,
			org_slug: ctx.org.slug,
			env: ctx.env,
			customer_id: customerId,
			internal_customer_id: customer.internal_id,
			event_name: "get_full_events_seek",
			value: 1,
			set_usage: false,
			timestamp: new Date(),
		});

		const query = getFullCusQuery({
			idOrInternalId: customerId,
			orgId: ctx.org.id,
			env: ctx.env,
			inStatuses: RELEVANT_STATUSES,
			includeInvoices: false,
			withEntities: false,
			withTrialsUsed: false,
			withSubs: false,
			withEvents: true,
			cusProductLimit: 10,
		});

		const [result] = await db.execute(query);
		expect(
			(result.events as { id: string }[]).map((event) => event.id),
		).toEqual([eventId]);

		// Seq scans off so the tiny test table can't hide whether the key is seekable.
		const eventNodes = await db.transaction(async (tx) => {
			await tx.execute(sql`SET LOCAL enable_seqscan = off`);
			const {
				rows: [row],
			} = await tx.execute(sql`EXPLAIN (FORMAT JSON) ${query}`);
			const [{ Plan: plan }] = Object.values(row)[0] as [{ Plan: PlanNode }];
			return findRelationNodes({ node: plan, relation: "events" });
		});
		expect(eventNodes.length).toBeGreaterThan(0);
		for (const node of eventNodes) {
			expect(node["Index Cond"]).toContain("internal_customer_id");
		}
	},
);
