import {
	type FullCusEntWithFullCusProduct,
	type FullCustomer,
	filterEntityProductCusEnts,
	filterOutEntityCusEnts,
	filterPerEntityCusEnts,
	getCusEntBalance,
	sumValues,
} from "@autumn/shared";
import { Decimal } from "decimal.js";

import type { RequestContext } from "../../../../../honoUtils/HonoEnv.js";

export const cusEntsToEntityBreakdown = ({
	ctx,
	fullCus,
	cusEnts,
}: {
	ctx: RequestContext;
	cusEnts: FullCusEntWithFullCusProduct[];
	fullCus: FullCustomer;
}) => {
	if (fullCus.entity) return undefined; // We don't need to show entity breakdown for a single entity.
	// Entity breakdown.

	const masterBalance = sumValues(
		filterOutEntityCusEnts({ cusEnts }).map((ce) => {
			const { balance } = getCusEntBalance({
				cusEnt: ce,
			});
			return balance;
		}),
	);

	const entityBalances: Record<string, number> = {};
	const perEntityCusEnts = filterPerEntityCusEnts({ cusEnts });

	for (const cusEnt of perEntityCusEnts) {
		for (const entityId in cusEnt.entities) {
			if (!entityBalances[entityId]) {
				entityBalances[entityId] = 0;
			}
			entityBalances[entityId] = new Decimal(entityBalances[entityId])
				.add(cusEnt.entities[entityId].balance)
				.toNumber();
		}
	}

	const entityProductCusEnts = filterEntityProductCusEnts({ cusEnts });
	for (const cusEnt of entityProductCusEnts) {
		const entityId =
			fullCus.entities.find(
				(e) => e.internal_id === cusEnt.customer_product?.internal_entity_id,
			)?.id || cusEnt.customer_product?.entity_id;

		if (!entityId) continue;

		if (!entityBalances[entityId]) {
			entityBalances[entityId] = 0;
		}
		entityBalances[entityId] = new Decimal(entityBalances[entityId])
			.add(cusEnt.balance ?? 0)
			.toNumber();
	}

	if (Object.keys(entityBalances).length === 0) return undefined;

	return {
		master: masterBalance,
		entities: sumValues(Object.values(entityBalances)),
	};
};
