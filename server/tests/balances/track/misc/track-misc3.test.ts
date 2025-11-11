import { beforeAll, describe, expect, test } from "bun:test";
import { ApiVersion } from "@autumn/shared";
import chalk from "chalk";
import { TestFeature } from "tests/setup/v2Features.js";
import ctx from "tests/utils/testInitUtils/createTestContext.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { EventService } from "../../../../src/internal/api/events/EventService.js";
import { initCustomerV3 } from "../../../../src/utils/scriptUtils/testUtils/initCustomerV3.js";

describe(`${chalk.yellowBright("track-misc3: testing track when customer balance is empty")}`, () => {
	const customerId = "track-misc3";
	const autumnV1: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });

	beforeAll(async () => {
		await initCustomerV3({
			ctx,
			customerId,
			withTestClock: false,
		});
	});

	test("should track and have event created", async () => {
		const trackRand = Math.floor(Math.random() * 10);

		let totalValue = 0;
		await Promise.all(
			Array.from({ length: trackRand }, () => {
				const trackValue = Math.random() * 10;
				totalValue += trackValue;
				return autumnV1.track({
					customer_id: customerId,
					feature_id: TestFeature.Messages,
					value: trackValue,
				});
			}),
		);

		const customer = await autumnV1.customers.get(customerId, {
			with_autumn_id: true,
		});

		const events = await EventService.getByCustomerId({
			db: ctx.db,
			orgId: ctx.org.id,
			internalCustomerId: customer.autumn_id ?? "",
			env: ctx.env,
		});

		expect(events).toHaveLength(trackRand);
		expect(events.reduce((acc, event) => acc + (event.value ?? 0), 0)).toBe(
			totalValue,
		);
	});
});
