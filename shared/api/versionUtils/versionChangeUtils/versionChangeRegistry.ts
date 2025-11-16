// Import customer feature changes
import { V0_1_CustomerChange } from "@api/customers/changes/V0.1_CustomerChange.js";
// Import customer changes
import { V0_2_CustomerChange } from "@api/customers/changes/V0.2_CustomerChange.js";
import { V0_2_InvoicesAlwaysExpanded } from "@api/customers/changes/V0.2_InvoicesAlwaysExpanded.js";
import { V1_1_FeaturesArrayToObject } from "@api/customers/changes/V1.1_FeaturesArrayToObject.js";

// Import customer product changes

import { V1_2_CustomerChange } from "@api/customers/changes/V1.2_CustomerChange.js";
import { V1_2_CustomerQueryChange } from "@api/customers/requestChanges/V1.2_CustomerQueryChange.js";
// Import entity changes
import { V1_2_EntityChange } from "@api/entities/changes/V1.2_EntityChange.js";
import { V1_2_EntityQueryChange } from "@api/entities/requestChanges/V1.2_EntityQueryChange.js";
// Import feature changes
import { V1_2_FeatureChange } from "@api/features/changes/V1.2_FeatureChange.js";
import { V1_2_CreateFeatureChange } from "@api/features/changes/V1.2_FeatureParamsChange.js";
// Import product changes
import { V1_2_ProductChanges } from "@api/products/changes/V1.2_ProductChanges.js";
import { V0_2_CheckChange } from "../../balances/check/changes/V0.2_CheckChange.js";
import { V1_2_CheckChange } from "../../balances/check/changes/V1.2_CheckChange.js";
import { V1_2_CheckQueryChange } from "../../balances/check/changes/V1.2_CheckQueryChange.js";
import { ApiVersion } from "../ApiVersion.js";
import type { VersionChangeConstructor } from "./VersionChange.js";
import { VersionChangeRegistryClass } from "./VersionChangeRegistryClass.js";

export const V2_CHANGES: VersionChangeConstructor[] = [
	V1_2_CustomerChange, // Transforms Customer TO V1.2 format from V2 format
	V1_2_CustomerQueryChange, // Transforms Customer Query TO V2.0 format (adds expand options)
	V1_2_EntityChange, // Transforms Entity TO V0 format from V1 format
	V1_2_EntityQueryChange, // Transforms Entity Query TO V2.0 format (adds expand options)
	V1_2_ProductChanges, // Transforms Product TO V1.2 format from V2 Plan format
	V1_2_CheckChange, // Transforms Check TO V1.2 format from V0.2 format
	V1_2_CheckQueryChange, // Transforms Check Query TO V2.0 format (adds expand options)

	V1_2_FeatureChange, // Transforms Feature TO V1_Beta format (V0) from V2 format (V1)
	V1_2_CreateFeatureChange, // Transforms Create Feature params TO V1_Beta
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
	V0_2_CheckChange, // Transforms TO V0_2: check response to balances array format
];

export const V0_2_CHANGES: VersionChangeConstructor[] = [
	V0_1_CustomerChange, // Transforms TO V0_1: removes next_reset_at, allowance, usage_limit
];

export const V0_1_CHANGES: VersionChangeConstructor[] = [];

export function registerAllVersionChanges() {
	VersionChangeRegistryClass.register({
		version: ApiVersion.V2_0,
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

export { V0_2_InvoicesAlwaysExpanded, V1_2_CheckQueryChange };
