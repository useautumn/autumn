import { findAutoTopupLimitByScope } from "./findAutoTopupLimitByScope";
import { insertAutoTopupLimit } from "./insertAutoTopupLimit";
import { updateAutoTopupLimitById } from "./updateAutoTopupLimitById";

export const autoTopupLimitRepo = {
	findByScope: findAutoTopupLimitByScope,
	insert: insertAutoTopupLimit,
	updateById: updateAutoTopupLimitById,
} as const;
