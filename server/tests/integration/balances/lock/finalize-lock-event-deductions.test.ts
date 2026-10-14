import { expect, test } from "bun:test";
import { ApiVersion, events } from "@autumn/shared";
import { AutumnInt } from "@server/external/autumn/autumnCli.js";
import { timeout } from "@server/utils/genUtils.js";
import { eventsDb } from "@tests/integration/balances/utils/events/getCustomerEvents.js";
import { deleteLock } from "@tests/integration/balances/utils/lockUtils/deleteLock.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { pollUntilAsserted } from "@tests/utils/genUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { and, desc, eq } from "drizzle-orm";

const getFullCustomerEvents = async ({
	customerId,
}: {
	customerId: string;
}) => {
	const autumnV2 = new AutumnInt({ version: ApiVersion.V2_0 });
	const customer = await autumnV2.customers.get(customerId, {
		with_autumn_id: true,
	});

	return eventsDb()
		.select()
		.from(events)
		.where(
			and(
				eq(events.internal_customer_id, customer.autumn_id ?? ""),
				eq(events.org_id, ctx.org.id),
				eq(events.env, ctx.env),
			),
		)
		.orderBy(desc(events.created_at))
		.limit(100);
};

test.concurrent(
	`${chalk.yellowBright("finalize lock unwind: finalize event carries deductions with negative value")}`,
	async () => {
		const customerId = "finalize-lock-event-deductions";
		const monthlyMessages = items.monthlyMessages({ includedUsage: 100 });
		const freeProd = products.base({
			id: "free",
			items: [monthlyMessages],
		});

		const { autumnV2_1, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [freeProd] }),
			],
			actions: [s.attach({ productId: freeProd.id })],
		});

		await deleteLock({ ctx, lockId: customerId });

		await autumnV2_1.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			required_balance: 10,
			lock: { enabled: true, lock_id: customerId },
		});

		await autumnV2_1.balances.finalize({
			lock_id: customerId,
			action: "confirm",
			override_value: 4,
		});

		await timeout(3000);
		const eventRows = await pollUntilAsserted({
			fetch: () => getFullCustomerEvents({ customerId }),
			assert: (rows) => expect(rows).toHaveLength(2),
			timeoutMs: 30_000,
		});
		const finalizeEvent = eventRows[0];
		expect(finalizeEvent.value).toBe(-6);

		expect(finalizeEvent.deductions).toBeArray();
		expect(finalizeEvent.deductions).toHaveLength(1);

		const deduction = finalizeEvent.deductions?.[0];
		expect(deduction?.feature_id).toBe(TestFeature.Messages);
		expect(deduction?.value).toBe(-6);
		expect(deduction?.balance_id).toBeString();

		expect(finalizeEvent.internal_product_id).not.toBeNull();
	},
);
