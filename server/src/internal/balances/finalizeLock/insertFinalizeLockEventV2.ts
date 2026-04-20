import { Decimal } from "decimal.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { globalEventBatchingManager } from "@/internal/balances/events/EventBatchingManager.js";
import { initEvent } from "@/internal/balances/events/initEvent.js";
import type { FinalizeLockContextV2 } from "@/internal/balances/utils/lockV2/buildFinalizeLockContextV2.js";

export const insertFinalizeLockEventV2 = ({
	ctx,
	finalizeLockContext,
}: {
	ctx: AutumnContext;
	finalizeLockContext: FinalizeLockContextV2;
}) => {
	const { receipt, fullSubject, finalValue, lockValue, properties } =
		finalizeLockContext;

	const event = initEvent({
		ctx,
		eventInfo: {
			event_name: receipt.feature_id,
			value: new Decimal(finalValue).sub(lockValue).toNumber(),
			properties,
		},
		internalCustomerId: fullSubject.internalCustomerId,
		internalEntityId: fullSubject.internalEntityId,
		customerId: receipt.customer_id,
		entityId: receipt.entity_id ?? undefined,
	});

	globalEventBatchingManager.addEvent(event);
};
