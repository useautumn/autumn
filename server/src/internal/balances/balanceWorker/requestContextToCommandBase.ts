import type { BaseCommand } from "@autumn/balance-engine";
import type { BalanceWorkerRequestContext } from "./balanceWorkerRequestContext.js";

export function requestContextToCommandBase({
	ctx,
	customerId,
	entityId = null,
	occurredAt = ctx.timestamp,
}: {
	ctx: BalanceWorkerRequestContext;
	customerId: string;
	entityId?: string | null;
	occurredAt?: number;
}): BaseCommand {
	return {
		schemaVersion: 1,
		requestId: ctx.id,
		identity: { orgId: ctx.org.id, env: ctx.env, customerId, entityId },
		occurredAt,
	};
}
