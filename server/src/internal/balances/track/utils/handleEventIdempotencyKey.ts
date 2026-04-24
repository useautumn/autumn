import type { TrackParams } from "@autumn/shared";
import { checkIdempotencyKey } from "@/internal/misc/idempotency/checkIdempotencyKey.js";
import type { AutumnContext } from "../../../../honoUtils/HonoEnv.js";

export const handleEventIdempotencyKey = async ({
	ctx,
	body,
}: {
	ctx: AutumnContext;
	body: TrackParams;
}) => {
	await checkIdempotencyKey({
		orgId: ctx.org.id,
		env: ctx.env,
		idempotencyKey: `track:${body.idempotency_key}`,
		logger: ctx.logger,
	});

	// const eventInfo = buildEventInfo(body);

	// const newEvent = initEvent({
	// 	ctx,
	// 	eventInfo,
	// 	internalCustomerId: fullCustomer.internal_id,
	// 	internalEntityId: fullCustomer.entity?.internal_id ?? undefined,
	// 	customerId: body.customer_id,
	// 	entityId: body.entity_id,
	// });

	// await EventService.insert({
	// 	db: ctx.db,
	// 	event: newEvent,
	// });

	// body.skip_event = true;
};
