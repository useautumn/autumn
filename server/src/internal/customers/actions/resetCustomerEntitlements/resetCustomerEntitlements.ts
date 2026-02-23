import type {
	AppEnv,
	FullCustomer,
	FullCustomerEntitlement,
	Organization,
	Rollover,
} from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService.js";
import { RolloverService } from "@/internal/customers/cusProducts/cusEnts/cusRollovers/RolloverService.js";
import { getCusEntsNeedingReset } from "./getCusEntsNeedingReset.js";
import { processReset } from "./processReset.js";

/** Find the original cusEnt reference on the FullCustomer by ID. */
const findOriginalCusEnt = ({
	fullCus,
	cusEntId,
}: {
	fullCus: FullCustomer;
	cusEntId: string;
}): FullCustomerEntitlement | null => {
	for (const cusProduct of fullCus.customer_products) {
		for (const cusEnt of cusProduct.customer_entitlements) {
			if (cusEnt.id === cusEntId) return cusEnt;
		}
	}

	for (const cusEnt of fullCus.extra_customer_entitlements || []) {
		if (cusEnt.id === cusEntId) return cusEnt;
	}

	return null;
};

/**
 * Lazily resets customer entitlements that have passed their next_reset_at.
 * Mutates the FullCustomer in-memory and awaits DB + rollover writes.
 * Returns true if any entitlements were reset.
 */
export const resetCustomerEntitlements = async ({
	fullCus,
	db,
	org,
	env,
}: {
	fullCus: FullCustomer;
	db: DrizzleCli;
	org: Organization;
	env: AppEnv;
}): Promise<boolean> => {
	const now = Date.now();

	const cusEntsNeedingReset = getCusEntsNeedingReset({ fullCus, now });

	if (cusEntsNeedingReset.length === 0) return false;

	const dbUpdates: Array<{
		id: string;
		updates: Record<string, unknown>;
	}> = [];
	const rolloverInserts: Array<{
		rows: Rollover[];
		fullCusEnt: FullCustomerEntitlement;
	}> = [];

	for (const cusEnt of cusEntsNeedingReset) {
		const result = await processReset({
			cusEnt,
			org,
			env,
		});

		if (!result) continue;

		// Mutate the original cusEnt on fullCus (not the spread copy)
		const original = findOriginalCusEnt({ fullCus, cusEntId: cusEnt.id });
		if (original) {
			Object.assign(original, result.updates);
		}

		dbUpdates.push({ id: cusEnt.id, updates: result.updates });

		if (result.rolloverInsert) {
			rolloverInserts.push(result.rolloverInsert);
		}
	}

	if (dbUpdates.length === 0) return false;

	// Await all DB writes
	await Promise.all([
		...dbUpdates.map(({ id, updates }) =>
			CusEntService.update({ db, id, updates }),
		),
		...rolloverInserts.map(({ rows, fullCusEnt }) =>
			RolloverService.insert({ db, rows, fullCusEnt }),
		),
	]);

	return true;
};
