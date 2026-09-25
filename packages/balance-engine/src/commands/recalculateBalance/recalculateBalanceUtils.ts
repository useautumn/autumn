import {
	cusEntsToUsage,
	cusEntToRecalculateScopeKey,
	cusEntToStartingBalance,
	getRecalculableScopeKeys,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import type { WorkerFullCustomerEntitlementWithProduct } from "../../models/subject/workerFullSubject.js";

type Row = WorkerFullCustomerEntitlementWithProduct;

/** Legacy `cusEntsToRecalculateUsage`: usage, less what a grant below zero never granted. */
export const rowsToRecalculateUsage = ({
	rows,
	entityId,
}: {
	rows: Row[];
	entityId?: string;
}): number => {
	let usage = new Decimal(cusEntsToUsage({ cusEnts: rows, entityId }));
	for (const row of rows) {
		usage = usage.minus(
			Math.min(0, cusEntToStartingBalance({ cusEnt: row }) ?? 0),
		);
	}
	return usage.toNumber();
};

/** The rows grouped by owner (customer or entity), only where one is overdrawn and another can absorb it. */
export const rowsToRecalculableScopes = ({
	rows,
	entityId,
}: {
	rows: Row[];
	entityId?: string;
}): Row[][] => {
	const recalculable = getRecalculableScopeKeys({ cusEnts: rows, entityId });
	const scopes = new Map<string, Row[]>();
	for (const row of rows) {
		const key = cusEntToRecalculateScopeKey({ cusEnt: row });
		if (!recalculable.has(key)) continue;
		scopes.set(key, [...(scopes.get(key) ?? []), row]);
	}
	return [...scopes.values()];
};
