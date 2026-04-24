import { checkIdempotencyKey } from "@/internal/misc/idempotency/checkIdempotencyKey.js";
import type { AutumnContext } from "../../../../honoUtils/HonoEnv.js";

export const getTrackIdempotencyKey = ({
	idempotencyKey,
	requestId,
}: {
	idempotencyKey?: string;
	requestId: string;
}) => `track:${idempotencyKey ?? requestId}`;

export const handleEventIdempotencyKey = async ({
	ctx,
	idempotencyKey,
	customerId,
}: {
	ctx: AutumnContext;
	idempotencyKey?: string;
	customerId: string;
}) => {
	await checkIdempotencyKey({
		orgId: ctx.org.id,
		env: ctx.env,
		idempotencyKey: getTrackIdempotencyKey({
			idempotencyKey,
			requestId: ctx.id,
		}),
		slotKey: customerId,
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
