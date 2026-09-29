import type { BaseCommand } from "@autumn/balance-engine";
import type { BalanceWorkerRequestContext } from "./balanceWorkerRequestContext.js";

/** What every command carries from the request: who asked, for which subject, and when. */
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
