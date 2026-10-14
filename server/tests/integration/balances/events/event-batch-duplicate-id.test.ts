import { expect, test } from "bun:test";
import { customers, events } from "@autumn/shared";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { and, eq } from "drizzle-orm";
import { EventService } from "@/internal/api/events/EventService.js";
import { generateId } from "@/utils/genUtils.js";

test.concurrent(
	`${chalk.yellowBright("events batch: duplicate event id must not discard the rest of the customer's batch")}`,
	async () => {
		const customerId = "event-batch-duplicate-id";

		const { ctx } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false })],
			actions: [],
		});

		const [customerRow] = await ctx.db
			.select()
			.from(customers)
			.where(
				and(
					eq(customers.id, customerId),
					eq(customers.org_id, ctx.org.id),
					eq(customers.env, ctx.env),
				),
			);

		const internalCustomerId = customerRow?.internal_id;
		expect(internalCustomerId).toBeTruthy();

		const baseEvent = {
			org_id: ctx.org.id,
			org_slug: ctx.org.slug,
			env: ctx.env,
			internal_customer_id: internalCustomerId,
			customer_id: customerId,
			idempotency_key: null,
			properties: {},
			set_usage: false,
		};

		const replayedId = generateId("evt");
		const freshId = generateId("evt");

		await EventService.insert({
			db: ctx.db,
			event: [
				{
					...baseEvent,
					id: replayedId,
					event_name: "duplicate_probe",
					value: 1,
					created_at: Date.now(),
					timestamp: new Date(),
				},
			],
		});

		const insertReplayBatch = () =>
			EventService.insert({
				db: ctx.db,
				event: [
					{
						...baseEvent,
						id: replayedId,
						event_name: "duplicate_probe",
						value: 1,
						created_at: Date.now(),
						timestamp: new Date(),
					},
					{
						...baseEvent,
						id: freshId,
						event_name: "fresh_probe",
						value: 7,
						created_at: Date.now(),
						timestamp: new Date(),
					},
				],
			});

		await expect(insertReplayBatch()).resolves.toBeDefined();

		const freshRows = await ctx.db
			.select()
			.from(events)
			.where(
				and(
					eq(events.id, freshId),
					eq(events.internal_customer_id, internalCustomerId!),
				),
			);

		expect(freshRows).toHaveLength(1);
		expect(freshRows[0]?.value).toBe(7);

		const replayedRows = await ctx.db
			.select()
			.from(events)
			.where(eq(events.id, replayedId));

		expect(replayedRows).toHaveLength(1);
		expect(replayedRows[0]?.event_name).toBe("duplicate_probe");
	},
);
