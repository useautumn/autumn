import { orgToCommandOrg } from "@autumn/balance-engine";
import type {
	FullCusEntWithFullCusProduct,
	FullCustomer,
} from "@autumn/shared";
import { getBalanceWorkerClient } from "@/external/balanceWorker/getBalanceWorkerClient.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getCusEntsNeedingReset } from "@/internal/customers/actions/resetCustomerEntitlements/getCusEntsNeedingReset.js";
import { requestContextToCommandBase } from "./requestContextToCommandBase.js";

/** The entity a due row belongs to, by public id; null for a customer-level row. Undefined when it can't be named from what was loaded. */
const entityIdOfRow = ({
	row,
	fullCus,
}: {
	row: FullCusEntWithFullCusProduct;
	fullCus: FullCustomer;
}): string | null | undefined => {
	const internalEntityId =
		row.internal_entity_id ?? row.customer_product?.internal_entity_id ?? null;
	if (internalEntityId === null) return null;
	const entityId =
		row.customer_product?.entity_id ??
		fullCus.entities?.find((entity) => entity.internal_id === internalEntityId)
			?.id;
	return entityId ?? undefined;
};

/** Each subject with a due row: the customer, and every entity whose own rows are due. */
const dueSubjectsOf = ({
	fullCus,
	now,
}: {
	fullCus: FullCustomer;
	now: number;
}): (string | null)[] => {
	const subjects = new Set<string | null>();
	for (const row of getCusEntsNeedingReset({ fullCus, now })) {
		const entityId = entityIdOfRow({ row, fullCus });
		if (entityId !== undefined) subjects.add(entityId);
	}
	return [...subjects];
};

/**
 * The worker path's lazy reset: each due subject's owning worker refills what it holds and lands it in
 * Postgres before this returns, so the caller can read fresh rows. True when something was refilled.
 * A failure is logged and never fails the read; the rows stay as loaded.
 */
export async function resetCustomerEntitlementsViaWorker({
	ctx,
	fullCus,
}: {
	ctx: AutumnContext;
	fullCus: FullCustomer;
}): Promise<boolean> {
	const now = Date.now();
	const subjects = dueSubjectsOf({ fullCus, now });
	if (subjects.length === 0) return false;
	const customerId = fullCus.id ?? fullCus.internal_id;
	try {
		const replies = await Promise.all(
			subjects.map((entityId) =>
				getBalanceWorkerClient().reset({
					command: {
						...requestContextToCommandBase({
							ctx,
							customerId,
							entityId,
							occurredAt: now,
						}),
						type: "reset",
						commandId: `${ctx.id}:reset:${fullCus.internal_id}:${entityId ?? "customer"}`,
						org: orgToCommandOrg({ org: ctx.org }),
						durability: "store",
					},
				}),
			),
		);
		return replies.some((reply) => reply.result !== null);
	} catch (error) {
		ctx.logger.warn("[balance-worker] lazy reset failed; rows read as loaded", {
			error,
			data: { customerId },
		});
		return false;
	}
}
