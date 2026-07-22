import { ApiVersion } from "@autumn/shared";
import { neonEventsDb } from "@server/db/initNeonEvents.js";
import { AutumnInt } from "@server/external/autumn/autumnCli.js";
import { EventService } from "@server/internal/api/events/EventService.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";

/** Events land in the split Neon events DB when configured; mirror the
 * writer's resolution so asserts read where the server wrote. */
export const eventsDb = () => neonEventsDb ?? ctx.db;

export const getCustomerEvents = async ({
	customerId,
}: {
	customerId: string;
}) => {
	const autumnV2: AutumnInt = new AutumnInt({ version: ApiVersion.V2_0 });

	const customer = await autumnV2.customers.get(customerId, {
		with_autumn_id: true,
	});

	const events = await EventService.getByCustomerId({
		db: eventsDb(),
		orgId: ctx.org.id,
		internalCustomerId: customer.autumn_id ?? "",
		env: ctx.env,
		limit: 10000,
	});

	return events;
};
