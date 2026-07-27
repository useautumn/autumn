import { clearAutoTopupSuspensions } from "./clearAutoTopupSuspensions";
import { findAutoTopupLimitByScope } from "./findAutoTopupLimitByScope";
import { findAutoTopupLimitsByCustomer } from "./findAutoTopupLimitsByCustomer";
import { insertAutoTopupLimit } from "./insertAutoTopupLimit";
import { updateAutoTopupLimitById } from "./updateAutoTopupLimitById";

export const autoTopupLimitRepo = {
	findByScope: findAutoTopupLimitByScope,
	findAllByCustomer: findAutoTopupLimitsByCustomer,
	insert: insertAutoTopupLimit,
	updateById: updateAutoTopupLimitById,
	clearSuspensions: clearAutoTopupSuspensions,
} as const;
