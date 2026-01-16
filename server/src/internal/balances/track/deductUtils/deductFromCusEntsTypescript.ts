import type {
	EntityBalance,
	FullCusEntWithFullCusProduct,
} from "@autumn/shared";
import { deductFromMainBalance } from "./deductFromMainBalance";

const applyUpdatesToCusEnt = ({
	cusEnt,
	newBalance,
	newEntities,
	newAdjustment,
}: {
	cusEnt: FullCusEntWithFullCusProduct;
	newBalance: number;
	newEntities: Record<string, EntityBalance> | null;
	newAdjustment: number;
}): FullCusEntWithFullCusProduct => {
	cusEnt.balance = newBalance;
	cusEnt.entities = newEntities;
	cusEnt.adjustment = newAdjustment;

	return cusEnt;
};

export const deductFromCusEntsTypescript = ({
	cusEnts,
	amountToDeduct,
	targetEntityId,

	// biome-ignore lint/correctness/noUnusedFunctionParameters: Not used yet, but can add in the future
	alterGrantedBalance,
}: {
	cusEnts: FullCusEntWithFullCusProduct[];
	amountToDeduct: number;
	targetEntityId?: string;
	alterGrantedBalance?: boolean;
}) => {
	// Pass 2: Deduct from main balance to 0
	for (const cusEnt of cusEnts) {
		if (amountToDeduct === 0) continue;

		// biome-ignore lint/correctness/noUnusedVariables: Might use deducted in the future
		const { deducted, newBalance, newEntities, newAdjustment, remaining } =
			deductFromMainBalance({
				cusEnt,
				amountToDeduct,
				targetEntityId,
				minBalance: 0,
			});

		amountToDeduct = remaining;

		// Update cusEnt with new values
		applyUpdatesToCusEnt({
			cusEnt,
			newBalance,
			newEntities,
			newAdjustment,
		});
	}

	// Pass 3: Deduct from main balance if amountToDeduct is still not 0
	for (const cusEnt of cusEnts) {
		if (amountToDeduct === 0) continue;

		const { newBalance, newEntities, newAdjustment, remaining } =
			deductFromMainBalance({
				cusEnt,
				amountToDeduct,
				targetEntityId,
			});

		amountToDeduct = remaining;

		// Update cusEnt with new values
		applyUpdatesToCusEnt({
			cusEnt,
			newBalance,
			newEntities,
			newAdjustment,
		});
	}
};
