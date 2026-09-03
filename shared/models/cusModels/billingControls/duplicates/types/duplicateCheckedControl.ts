import type { ControlByKey } from "./controlByKey.js";
import type { DuplicateCheckedControlKey } from "./duplicateCheckedControlKey.js";

export type DuplicateCheckedControl<TKey extends DuplicateCheckedControlKey> =
	ControlByKey[TKey];
