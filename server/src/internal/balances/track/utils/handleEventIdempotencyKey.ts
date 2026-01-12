import type { FullCustomer, TrackParams } from "@autumn/shared";
import type { AutumnContext } from "../../../../honoUtils/HonoEnv";
import { EventService } from "../../../api/events/EventService";
import { buildEventInfo, initEvent } from "../../events/initEvent";

export const handleEventIdempotencyKey = async ({
	ctx,
	body,
	fullCustomer,
}: {
	ctx: AutumnContext;
	body: TrackParams;
	fullCustomer: FullCustomer;
}) => {
	const eventInfo = buildEventInfo(body);

	const newEvent = initEvent({
		ctx,
		eventInfo,
		internalCustomerId: fullCustomer.internal_id,
		internalEntityId: fullCustomer.entity?.internal_id ?? undefined,
		customerId: body.customer_id,
		entityId: body.entity_id,
	});

	await EventService.insert({
		db: ctx.db,
		event: newEvent,
	});

	body.skip_event = true;
};
