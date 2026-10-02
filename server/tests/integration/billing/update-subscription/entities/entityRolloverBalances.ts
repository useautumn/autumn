import type { ApiEntityV0 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";

export const entityRolloverBalances = (entity: ApiEntityV0) =>
	(entity.features?.[TestFeature.Messages]?.rollovers ?? [])
		.map((rollover) => rollover.balance)
		.sort((a, b) => a - b);
