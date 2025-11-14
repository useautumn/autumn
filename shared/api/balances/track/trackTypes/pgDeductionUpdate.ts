import type { EntityBalance } from "@models/cusProductModels/cusEntModels/cusEntModels.js";
import type {
	InsertReplaceable,
	Replaceable,
} from "@models/cusProductModels/cusEntModels/replaceableTable.js";

export interface PgDeductionUpdate {
	balance: number;
	additional_balance: number;
	additional_granted_balance?: number;
	entities: Record<string, EntityBalance>;
	adjustment: number;
	deducted: number;
	additional_deducted?: number;
	newReplaceables?: InsertReplaceable[];
	deletedReplaceables?: Replaceable[];
}
