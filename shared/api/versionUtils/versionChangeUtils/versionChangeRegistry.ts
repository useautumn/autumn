import { V1_1_LegacyExpandInvoices } from "@api/customers/changes/V1_1_LegacyExpandInvoices.js";
// Import customer changes
import { V1_1_MergedResponse } from "@api/customers/changes/V1_1_MergedResponse.js";
// Import customer feature changes
import { V1_2_FeaturesArrayToObject } from "@api/customers/changes/V1_2_FeaturesArrayToObject.js";
// Import customer product changes
import { V0_2_ProductItems } from "@api/customers/cusProducts/changes/V0_2_ProductItems.js";
import { ApiVersion } from "../ApiVersion.js";
import type { VersionChangeConstructor } from "./VersionChange.js";
import { VersionChangeRegistryClass } from "./VersionChangeRegistryClass.js";

/**
 * V1_4 (2025-06-01) - Beta Features
 *
 * Breaking changes:
 * - TBD (beta version)
 */
export const V1_4_CHANGES: VersionChangeConstructor[] = [
	// Add beta changes here when needed
];

/**
 * V1_2 (2025-05-05) - Features Redesign
 *
 * Breaking changes:
 * - customer.features: array → object (keyed by feature_id)
 */
export const V1_2_CHANGES: VersionChangeConstructor[] = [
	V1_2_FeaturesArrayToObject,
];

/**
 * V1_1 (2025-04-17) - Unified Customer Response
 *
 * Breaking changes:
 * - Merged split customer response into single object
 * - Renamed entitlements → features
 * - invoices now require explicit expand parameter (side effect)
 */
export const V1_1_CHANGES: VersionChangeConstructor[] = [
	V1_1_MergedResponse,
	V1_1_LegacyExpandInvoices, // Side effect
];

/**
 * V0_2 (2025-04-01) - Product Items
 *
 * Breaking changes:
 * - Customer products gained 'items' field
 * - Enhanced product structure
 */
export const V0_2_CHANGES: VersionChangeConstructor[] = [V0_2_ProductItems];

/**
 * V0_1 (2025-02-01) - Original
 *
 * No changes (original version)
 */
export const V0_1_CHANGES: VersionChangeConstructor[] = [];

/**
 * Register all version changes (newest first)
 *
 * Auto-runs on import
 */
export function registerAllVersionChanges() {
	VersionChangeRegistryClass.register({
		version: ApiVersion.V1_4,
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
