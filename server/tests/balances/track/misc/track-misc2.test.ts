import { beforeAll, describe, expect, test } from "bun:test";
import { ApiVersion } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { EventService } from "../../../../src/internal/api/events/EventService.js";
import { timeout } from "../../../utils/genUtils.js";

const testCase = "track-misc2";

describe(`${chalk.yellowBright("track-misc2: testing track auto creates customer and entity")}`, () => {
	const customerId = "track-misc2";
	const autumnV1: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });

	beforeAll(async () => {
		try {
			await autumnV1.customers.delete(customerId);
		} catch {
			// Ignore if customer doesn't exist
		}
	});

	test("should track event for customer / entity and have properties set", async () => {
		await autumnV1.track({
			customer_id: customerId,
			customer_data: {
				name: "track-misc2",
				email: "track-misc2@test.com",
			},
			feature_id: TestFeature.Messages,
			value: 5,
			properties: {
				hello: "world",
				foo: "bar",
			},
		});

		const customer = await autumnV1.customers.get(customerId, {
			with_autumn_id: true,
		});

		await timeout(2000);

		const events = await EventService.getByCustomerId({
			db: ctx.db,
			orgId: ctx.org.id,
			internalCustomerId: customer.autumn_id!,
			env: ctx.env,
		});

		expect(events).toHaveLength(1);
		expect(events?.[0].properties).toMatchObject({
			hello: "world",
			foo: "bar",
		});
	});
});
