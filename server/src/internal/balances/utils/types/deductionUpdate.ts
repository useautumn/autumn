import type {
	EntityBalance,
	InsertReplaceable,
	Replaceable,
	UsageAttribution,
} from "@autumn/shared";

export interface DeductionUpdate {
	balance: number;
	additional_balance: number;
	additional_granted_balance?: number;
	entities: Record<string, EntityBalance>;
	usage_attribution?: UsageAttribution;
	adjustment: number;
	deducted: number;
	additional_deducted?: number;
	newReplaceables?: InsertReplaceable[];
	deletedReplaceables?: Replaceable[];
}

export type DeductionUpdates = Record<string, DeductionUpdate>;
