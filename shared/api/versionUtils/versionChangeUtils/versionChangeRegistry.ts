// Import customer feature changes
import { V0_1_CustomerChange } from "@api/customers/changes/V0.1_CustomerChange.js";
// Import customer changes
import { V0_2_CustomerChange } from "@api/customers/changes/V0.2_CustomerChange.js";
import { V0_2_InvoicesAlwaysExpanded } from "@api/customers/changes/V0.2_InvoicesAlwaysExpanded.js";
import { V1_1_FeaturesArrayToObject } from "@api/customers/changes/V1.1_FeaturesArrayToObject.js";

// Import customer product changes

import { V1_2_CustomerChange } from "@api/customers/changes/V1.2_CustomerChange.js";
import { V1_2_CustomerQueryChange } from "@api/customers/requestChanges/V1.2_CustomerQueryChange.js";
// Import product changes
import { V1_2_ProductChanges } from "@api/products/changes/V1.2_ProductChanges.js";
import { ApiVersion } from "../ApiVersion.js";
import type { VersionChangeConstructor } from "./VersionChange.js";
import { VersionChangeRegistryClass } from "./VersionChangeRegistryClass.js";

export const V2_CHANGES: VersionChangeConstructor[] = [
	V1_2_CustomerChange, // Transforms Customer TO V1.2 format from V2 format
	V1_2_CustomerQueryChange, // Transforms Customer Query TO V2.0 format (adds expand options)
	V1_2_ProductChanges, // Transforms Product TO V1.2 format from V2 Plan format
];

export const V1_4_CHANGES: VersionChangeConstructor[] = [
	// Add beta changes here when needed
];

export const V1_2_CHANGES: VersionChangeConstructor[] = [
	V1_1_FeaturesArrayToObject, // Transforms TO V1_1
];

export const V1_1_CHANGES: VersionChangeConstructor[] = [
	V0_2_CustomerChange, // Transforms TO V0_2: splits structure + transforms features
	V0_2_InvoicesAlwaysExpanded, // Side effect: invoices always expanded for V0_2 and older
];

export const V0_2_CHANGES: VersionChangeConstructor[] = [
	V0_1_CustomerChange, // Transforms TO V0_1: removes next_reset_at, allowance, usage_limit
];

export const V0_1_CHANGES: VersionChangeConstructor[] = [];

export function registerAllVersionChanges() {
	VersionChangeRegistryClass.register({
		version: ApiVersion.V2,
		changes: V2_CHANGES,
	});
	VersionChangeRegistryClass.register({
		version: ApiVersion.V1_Beta,
		changes: V1_4_CHANGES,
	});
	VersionChangeRegistryClass.register({
		version: ApiVersion.V1_2,
		changes: V1_2_CHANGES,
	});
	VersionChangeRegistryClass.register({
		version: ApiVersion.V1_1,
		changes: V1_1_CHANGES,
	});
	VersionChangeRegistryClass.register({
		version: ApiVersion.V0_2,
		changes: V0_2_CHANGES,
	});
	VersionChangeRegistryClass.register({
		version: ApiVersion.V0_1,
		changes: V0_1_CHANGES,
	});
}

// Auto-register on import
registerAllVersionChanges();

export { V0_2_InvoicesAlwaysExpanded };
