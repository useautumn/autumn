import { Decimal } from "decimal.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { globalEventBatchingManager } from "@/internal/balances/events/EventBatchingManager.js";
import { initEvent } from "@/internal/balances/events/initEvent.js";
import type { FinalizeLockContext } from "./buildFinalizeLockContext.js";

/** Constructs and queues a finalize lock event. Event value = finalValue - lockValue. */
export const insertFinalizeLockEvent = ({
	ctx,
	finalizeLockContext,
}: {
	ctx: AutumnContext;
	finalizeLockContext: FinalizeLockContext;
}) => {
	const { receipt, fullCustomer, finalValue, lockValue, properties } =
		finalizeLockContext;
	const event = initEvent({
		ctx,
		eventInfo: {
			event_name: receipt.feature_id,
			value: new Decimal(finalValue).sub(lockValue).toNumber(),
			properties,
		},
		internalCustomerId: fullCustomer.internal_id,
		internalEntityId: fullCustomer.entity?.internal_id,
		customerId: receipt.customer_id,
		entityId: receipt.entity_id ?? undefined,
	});

	globalEventBatchingManager.addEvent(event);
};
