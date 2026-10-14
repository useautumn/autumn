import type { CreditRateCard } from "@autumn/shared";

export type DeductionRow = {
	table: "customerEntitlements" | "rollovers";
	id: string;
	entityKey: string | null;
	featureId: string;
	balance: number;
	creditCost: number;
	rateCard: CreditRateCard | null;
	rateUnits: number;
	ownerId: string;
	usageAllowed: boolean;
	freeAllocated: boolean;
	minBalance: number | null;
	maxBalance: number | null;
	unlimited: boolean;
	skipsRollovers: boolean;
};
