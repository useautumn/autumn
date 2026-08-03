/**
 * TDD test for duplicate event inserts destroying an entire per-customer batch.
 *
 * Prod symptom (150,034 occurrences / 7 days, all orgs):
 *   "❌ Failed to insert 2 events for customer cus_...: Event (event_name,
 *    customer_id, idempotency_key) already exists."
 *
 * Event ids are random (initEvent: generateId("evt")), so two independent
 * calls cannot collide — the whole SQS message is being delivered twice.
 * runInsertEventBatch commits before the message is acked (deletion is
 * deferred to batchDeleteMessages), so a worker recycle or failed delete
 * replays the batch against rows that are already committed. Observed shape:
 * every customer in a batch failing within ~1.8ms, 1,775 batches on 2026-08-01.
 *
 * All observed events carry idempotency_key: null and unique_event_constraint
 * is NULLS DISTINCT, so the 23505 is the PRIMARY KEY on id — not the unique
 * constraint the error message names.
 *
 * A pure replay loses nothing (the rows were written by the first delivery);
 * the damage is a batch that MIXES replayed and fresh events, which is what
 * this test pins.
 *
 * Red-failure mode (current behavior):
 *  - One statement per customer with no conflict handling, so a single
 *    duplicate id aborts the whole statement and the fresh events die with it.
 *
 * Green-success criteria (after fix):
 *  - Every event ends up inserted exactly once: the duplicate is skipped, the
 *    fresh event still lands, and the original row is not mutated.
 */

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

		// First delivery lands normally.
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

		// Second delivery replays the same id alongside a brand-new event —
		// exactly the shape runInsertEventBatch groups per customer.
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

		// ── Assertion 1: the replay must not throw ────────────────────────
		// Pre-fix: throws RecaseError "Event (...) already exists."
		await expect(insertReplayBatch()).resolves.toBeDefined();

		// ── Assertion 2: the non-duplicate event must survive ─────────────
		// Pre-fix: rolled back with the duplicate, silently lost.
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

		// ── Assertion 3: the original row is untouched ────────────────────
		const replayedRows = await ctx.db
			.select()
			.from(events)
			.where(eq(events.id, replayedId));

		expect(replayedRows).toHaveLength(1);
		expect(replayedRows[0]?.event_name).toBe("duplicate_probe");
	},
);
