import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import { eventActions } from "@/internal/analytics/actions/eventActions.js";
import { generateId, timeout } from "@/utils/genUtils.js";

const free = products.base({
	items: [items.monthlyMessages({ includedUsage: 100 })],
});

/**
 * Tinybird Migration Test Suite
 *
 * Cases to check that events work:
 * - check with track
 * - track through redis
 * - track through postgres (paid allocated case, or skipCache=true)
 * - idempotency key passed in
 */

test("tinybird migration - dual write", async () => {
	const customerId = "track-tinybird-migration";

	const { autumnV1, ctx } = await initScenario({
		setup: [
			s.deleteCustomer({ customerId }),
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free] }),
		],
		actions: [s.attach({ productId: "base" })],
		customerId,
	});

	// 1. Check with send_event: true
	const checkEventId = generateId("evt");
	await autumnV1.check(
		{
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			required_balance: 10,
			send_event: true,
		},
		{
			headers: { "x-event-id": checkEventId },
		},
	);

	// 2. Track through redis (default path)
	const redisEventId = generateId("evt");
	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 15,
		},
		{
			headers: { "x-event-id": redisEventId },
		},
	);

	// 3. Track through postgres (skipCache=true)
	const postgresEventId = generateId("evt");
	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 20,
		},
		{
			skipCache: true,
			headers: { "x-event-id": postgresEventId },
		},
	);

	// 4. Track with idempotency key
	const idempotencyEventId = generateId("evt");
	const idempotencyKey = `idem-${generateId("test")}`;
	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 25,
			idempotency_key: idempotencyKey,
		},
		{
			headers: { "x-event-id": idempotencyEventId },
		},
	);

	// Wait for async Tinybird ingestion
	await timeout(5000);

	// Verify all events in Tinybird
	const checkEvent = await eventActions.getEventById({
		orgId: ctx.org.id,
		env: ctx.env,
		eventId: checkEventId,
	});
	expect(checkEvent.id).toBe(checkEventId);
	expect(checkEvent.customer_id).toBe(customerId);
	expect(Number(checkEvent.value)).toBe(10);

	const redisEvent = await eventActions.getEventById({
		orgId: ctx.org.id,
		env: ctx.env,
		eventId: redisEventId,
	});
	expect(redisEvent.id).toBe(redisEventId);
	expect(redisEvent.customer_id).toBe(customerId);
	expect(Number(redisEvent.value)).toBe(15);

	const postgresEvent = await eventActions.getEventById({
		orgId: ctx.org.id,
		env: ctx.env,
		eventId: postgresEventId,
	});
	expect(postgresEvent.id).toBe(postgresEventId);
	expect(postgresEvent.customer_id).toBe(customerId);
	expect(Number(postgresEvent.value)).toBe(20);

	const idempotencyEvent = await eventActions.getEventById({
		orgId: ctx.org.id,
		env: ctx.env,
		eventId: idempotencyEventId,
	});
	expect(idempotencyEvent.id).toBe(idempotencyEventId);
	expect(idempotencyEvent.idempotency_key).toBe(idempotencyKey);
});
