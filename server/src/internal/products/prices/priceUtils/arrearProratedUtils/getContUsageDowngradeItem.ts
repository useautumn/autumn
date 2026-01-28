import {
	type FullCustomerEntitlement,
	type InsertReplaceable,
	OnDecrease,
	type Price,
} from "@autumn/shared";
import { generateId } from "@/utils/genUtils.js";

export const getReplaceables = ({
	cusEnt,
	prevOverage,
	newOverage,
	deleteNextCycle = true,
}: {
	cusEnt: FullCustomerEntitlement;
	prevOverage: number;
	newOverage: number;
	deleteNextCycle?: boolean;
}): InsertReplaceable[] => {
	if (prevOverage <= newOverage) {
		return [];
	}

	const numReplaceables = prevOverage - newOverage;
	const newReplaceables = Array.from({ length: numReplaceables }, (_, i) => ({
		id: generateId("rep"),
		cus_ent_id: cusEnt.id,
		created_at: Date.now(),
		delete_next_cycle: deleteNextCycle,
	}));

	return newReplaceables;
};

const getContUsageDowngradeItem = ({
	price,
	cusEnt,
	prevOverage,
	newOverage,
}: {
	price: Price;
	cusEnt: FullCustomerEntitlement;
	prevOverage: number;
	newOverage: number;
}) => {
	const noProration = price.proration_config?.on_decrease === OnDecrease.None;

	if (noProration) {
		const newReplaceables = getReplaceables({
			cusEnt,
			prevOverage,
			newOverage,
		});

		return {
			newReplaceables,
			amount: null,
		};
	} else {
	}
};
