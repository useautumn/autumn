// Import customer feature changes
import { V0_1_CustomerChange } from "@api/customers/changes/V0.1_CustomerChange";
// Import customer changes
import { V0_2_CustomerChange } from "@api/customers/changes/V0.2_CustomerChange";
import { V0_2_InvoicesAlwaysExpanded } from "@api/customers/changes/V0.2_InvoicesAlwaysExpanded";
import { V1_1_FeaturesArrayToObject } from "@api/customers/changes/V1.1_FeaturesArrayToObject";
// Import trials used changes
import { V1_2_TrialsUsedChange } from "@api/customers/components/apiTrialsUsed/changes/V1.2_TrialsUsedChange";

// Import customer product changes

import { V1_2_CustomerChange } from "@api/customers/changes/V1.2_CustomerChange";
import { V1_2_CustomerQueryChange } from "@api/customers/requestChanges/V1.2_CustomerQueryChange";
// Import entity changes
import { V1_2_EntityChange } from "@api/entities/changes/V1.2_EntityChange";
import { V2_0_EntityChange } from "@api/entities/changes/V2.0_EntityChange";
import { V1_2_EntityQueryChange } from "@api/entities/requestChanges/V1.2_EntityQueryChange";
// Import feature changes
import { V1_2_FeatureChange } from "@api/features/changes/V1.2_FeatureChange";
import { V1_2_CreateFeatureChange } from "@api/features/changes/V1.2_FeatureParamsChange";
// Import invoice changes
import { V1_2_InvoiceChange } from "@api/others/apiInvoice/changes/V1.2_InvoiceChange";

// Import product changes

import { V2_0_CustomerChange } from "@api/customers/changes/V2.0_CustomerChange";
import { V1_2_ProductChanges } from "@api/products/changes/V1.2_ProductChanges";
import { V2_0_PlanChanges } from "@api/products/changes/V2.0_PlanChanges";
import { V0_2_CheckChange } from "../../balances/check/changes/V0.2_CheckChange";
import { V1_2_CheckChange } from "../../balances/check/changes/V1.2_CheckChange";
import { V1_2_CheckQueryChange } from "../../balances/check/changes/V1.2_CheckQueryChange";
import { V2_0_CheckChange } from "../../balances/check/changes/V2.0_CheckChange";
import { V1_2_TrackChange } from "../../balances/track/changes/V1.2_TrackChange";
import { V2_0_TrackChange } from "../../balances/track/changes/V2.0_TrackChange";
import { V1_2_TrackParamsChange } from "../../balances/track/requestChanges/V1.2_TrackParamsChange";
// Import attach changes
import { V0_2_AttachChange } from "../../billing/attach/changes/V0.2_AttachChange";
import { V1_2_AttachParamsChange } from "../../billing/attachV2/requestChanges/V1.2_AttachParamsChange";
import { V1_2_UpdateSubscriptionParamsChange } from "../../billing/updateSubscription/requestChanges/V1.2_UpdateSubscriptionParamsChange";
import { ApiVersion } from "../ApiVersion";
import type { VersionChangeConstructor } from "./VersionChange";
import { VersionChangeRegistryClass } from "./VersionChangeRegistryClass";

export const V2_1_CHANGES: VersionChangeConstructor[] = [
	V2_0_PlanChanges, // Transforms Plan TO V2.0 format from V2.1 format
	V2_0_CustomerChange, // Transforms Customer TO V2.0 format from V2.1 format
	V2_0_EntityChange, // Transforms Entity TO V2.0 format from V2.1 format
	V2_0_CheckChange, // Transforms Check TO V2.0 format from V2.1 format
	V2_0_TrackChange, // Transforms Track TO V2.0 format from V2.1 format
];

export const V2_CHANGES: VersionChangeConstructor[] = [
	V1_2_CustomerChange, // Transforms Customer TO V1.2 format from V2 format
	V1_2_CustomerQueryChange, // Transforms Customer Query TO V2.0 format (adds expand options)
	V1_2_EntityChange, // Transforms Entity TO V0 format from V1 format
	V1_2_EntityQueryChange, // Transforms Entity Query TO V2.0 format (adds expand options)
	V1_2_ProductChanges, // Transforms Product TO V1.2 format from V2 Plan format
	V1_2_InvoiceChange, // Transforms Invoice TO V1.2 format from V2 format (plan_ids → product_ids)
	V1_2_TrialsUsedChange, // Transforms TrialsUsed TO V1.2 format from V2 format (plan_id → product_id)
	V1_2_CheckChange, // Transforms Check TO V1.2 format from V0.2 format
	V1_2_CheckQueryChange, // Transforms Check Query TO V2.0 format (adds expand options)
	V1_2_TrackChange, // Transforms Track TO V1.2 format from V0.2 format
	V1_2_TrackParamsChange, // Transforms Track params TO V2.0 (maps properties.value → value)
	V1_2_AttachParamsChange, // Transforms attach params TO V2.0 (free_trial/items -> free_trial/customize)
	V1_2_UpdateSubscriptionParamsChange, // Transforms update params TO V2.0 (free_trial/items -> free_trial/customize)

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
	V0_2_AttachChange, // Transforms TO V0_2: minimal attach response format
];

export const V0_2_CHANGES: VersionChangeConstructor[] = [
	V0_1_CustomerChange, // Transforms TO V0_1: removes next_reset_at, allowance, usage_limit
];

export const V0_1_CHANGES: VersionChangeConstructor[] = [];

export function registerAllVersionChanges() {
	VersionChangeRegistryClass.register({
		version: ApiVersion.V2_1,
		changes: V2_1_CHANGES,
	});
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
