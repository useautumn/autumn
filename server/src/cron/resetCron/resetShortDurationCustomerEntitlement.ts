import type { EntInterval, FullEntitlement, ResetCusEnt } from "@autumn/shared";
import { UTCDate } from "@date-fns/utc";
import { Decimal } from "decimal.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { RolloverService } from "@/internal/customers/cusProducts/cusEnts/cusRollovers/RolloverService";
import { getRolloverUpdates } from "@/internal/customers/cusProducts/cusEnts/cusRollovers/rolloverUtils";
import { getResetBalancesUpdate } from "@/internal/customers/cusProducts/cusEnts/groupByUtils";
import { getNextResetAt } from "@/utils/timeUtils.js";

export const resetShortDurationCustomerEntitlement = async ({
	db,
	cusEnt,
	updatedCusEnts,
}: {
	db: DrizzleCli;
	cusEnt: ResetCusEnt;
	updatedCusEnts: ResetCusEnt[];
}) => {
	const ent = cusEnt.entitlement as FullEntitlement;

	if (!cusEnt.next_reset_at) return;

	const resetCusEnt = {
		...cusEnt,
		next_reset_at: getNextResetAt({
			curReset: new UTCDate(cusEnt.next_reset_at),
			interval: ent.interval as EntInterval,
			intervalCount: ent.interval_count,
		}),
		adjustment: 0,
		...getResetBalancesUpdate({
			cusEnt,
			allowance: new Decimal(ent.allowance || 0)
				.mul(cusEnt.customer_product?.quantity ?? 1)
				.toNumber(),
		}),
	};
	const newCusEnt = resetCusEnt;

	const rolloverUpdate = getRolloverUpdates({
		cusEnt,
		nextResetAt: cusEnt.next_reset_at,
	});

	if (rolloverUpdate?.toInsert && rolloverUpdate.toInsert.length > 0) {
		await RolloverService.insert({
			db,
			rows: rolloverUpdate.toInsert,
			fullCusEnt: cusEnt,
		});
	}

	console.log(
		`Reseting short cus ent (${cusEnt.feature_id}) [${ent.interval}], customer: ${cusEnt.customer_id}, org: ${cusEnt.customer.org_id}`,
	);

	updatedCusEnts.push(newCusEnt);

	return newCusEnt;
};
