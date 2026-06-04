import type {
	EntityBalance,
	InsertReplaceable,
	Replaceable,
	UsageWindow,
} from "@autumn/shared";

export interface DeductionUpdate {
	balance: number;
	additional_balance: number;
	additional_granted_balance?: number;
	entities: Record<string, EntityBalance>;
	adjustment: number;
	deducted: number;
	additional_deducted?: number;
	newReplaceables?: InsertReplaceable[];
	deletedReplaceables?: Replaceable[];
	usage_windows?: UsageWindow[] | null;
}

export type DeductionUpdates = Record<string, DeductionUpdate>;
