import type { ControlByKey } from "./controlByKey.js";
import type { DuplicateCheckedControlKey } from "./duplicateCheckedControlKey.js";

export type DuplicateCheckedBillingControls = {
	[TKey in DuplicateCheckedControlKey]?: Array<ControlByKey[TKey]> | null;
};
