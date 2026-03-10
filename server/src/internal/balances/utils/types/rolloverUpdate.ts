import type { EntityRolloverBalance } from "@autumn/shared";

export interface RolloverUpdate {
	cus_ent_id?: string;
	balance: number;
	usage: number;
	entities: Record<string, EntityRolloverBalance>;
}
