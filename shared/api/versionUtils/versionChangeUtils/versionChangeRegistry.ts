import { V0_1_CustomerChange } from "@api/customers/changes/V0.1_CustomerChange";
import { V0_2_CustomerChange } from "@api/customers/changes/V0.2_CustomerChange";
import { V0_2_InvoicesAlwaysExpanded } from "@api/customers/changes/V0.2_InvoicesAlwaysExpanded";
import { V1_1_FeaturesArrayToObject } from "@api/customers/changes/V1.1_FeaturesArrayToObject";
import { V1_2_TrialsUsedChange } from "@api/customers/components/apiTrialsUsed/changes/V1.2_TrialsUsedChange";

import { V1_2_CustomerChange } from "@api/customers/changes/V1.2_CustomerChange";
import { V1_2_CustomerQueryChange } from "@api/customers/requestChanges/V1.2_CustomerQueryChange";
import { V2_0_CustomerQueryChange } from "@api/customers/requestChanges/V2.0_CustomerQueryChange";
import { V1_2_EntityChange } from "@api/entities/changes/V1.2_EntityChange";
import { V2_0_EntityChange } from "@api/entities/changes/V2.0_EntityChange";
import { V1_2_EntityQueryChange } from "@api/entities/requestChanges/V1.2_EntityQueryChange";
import { V1_2_FeatureChange } from "@api/features/changes/V1.2_FeatureChange";
import { V1_2_CreateFeatureChange } from "@api/features/changes/V1.2_FeatureParamsChange";
import { V1_2_InvoiceChange } from "@api/others/apiInvoice/changes/V1.2_InvoiceChange";

import { V2_0_CustomerChange } from "@api/customers/changes/V2.0_CustomerChange";
import { V2_2_PlanInheritedBillingControls } from "@api/customers/changes/V2.2_PlanInheritedBillingControls";
import { V2_3_CustomerEntityData } from "@api/customers/changes/V2.3_CustomerEntityData";
import { V1_2_ProductChanges } from "@api/products/changes/V1.2_ProductChanges";
import { V2_0_PlanChanges } from "@api/products/changes/V2.0_PlanChanges";
import { V2_1_PlanChanges } from "@api/products/changes/V2.1_PlanChanges";
import { V0_2_CheckChange } from "../../balances/check/changes/V0.2_CheckChange";
import { V1_2_CheckChange } from "../../balances/check/changes/V1.2_CheckChange";
import { V1_2_CheckQueryChange } from "../../balances/check/changes/V1.2_CheckQueryChange";
import { V2_0_CheckChange } from "../../balances/check/changes/V2.0_CheckChange";
import { V1_2_TrackChange } from "../../balances/track/changes/V1.2_TrackChange";
import { V2_0_TrackChange } from "../../balances/track/changes/V2.0_TrackChange";
import { V1_2_TrackParamsChange } from "../../balances/track/requestChanges/V1.2_TrackParamsChange";
import { V2_4_BatchTrackParamsChange } from "../../balances/track/requestChanges/V2.4_BatchTrackParamsChange";
import { V2_4_BatchTrackTokensParamsChange } from "../../balances/track/requestChanges/V2.4_BatchTrackTokensParamsChange";
import { V2_4_TrackParamsChange } from "../../balances/track/requestChanges/V2.4_TrackParamsChange";
import { V2_4_TrackTokensParamsChange } from "../../balances/track/requestChanges/V2.4_TrackTokensParamsChange";
import { V0_2_AttachChange } from "../../billing/attach/changes/V0.2_AttachChange";
import { V1_2_AttachParamsChange } from "../../billing/attachV2/requestChanges/V1.2_AttachParamsChange";
import { V1_2_UpdateSubscriptionParamsChange } from "../../billing/updateSubscription/requestChanges/V1.2_UpdateSubscriptionParamsChange";
import { V2_0_AggregateEventsChange } from "../../events/aggregate/changes/V2.0_AggregateEventsChange";
import { ApiVersion } from "../ApiVersion";
import type { VersionChangeConstructor } from "./VersionChange";
import { VersionChangeRegistryClass } from "./VersionChangeRegistryClass";

export const V2_5_CHANGES: VersionChangeConstructor[] = [
	V2_4_TrackParamsChange,
	V2_4_TrackTokensParamsChange,
	V2_4_BatchTrackParamsChange,
	V2_4_BatchTrackTokensParamsChange,
];

export const V2_4_CHANGES: VersionChangeConstructor[] = [
	V2_3_CustomerEntityData,
];

export const V2_3_CHANGES: VersionChangeConstructor[] = [
	V2_2_PlanInheritedBillingControls,
];

export const V2_2_CHANGES: VersionChangeConstructor[] = [V2_1_PlanChanges];

export const V2_1_CHANGES: VersionChangeConstructor[] = [
	V2_0_PlanChanges,
	V2_0_CustomerChange,
	V2_0_CustomerQueryChange,
	V2_0_EntityChange,
	V2_0_CheckChange,
	V2_0_TrackChange,
	V2_0_AggregateEventsChange,
];

export const V2_CHANGES: VersionChangeConstructor[] = [
	V1_2_CustomerChange,
	V1_2_CustomerQueryChange,
	V1_2_EntityChange,
	V1_2_EntityQueryChange,
	V1_2_ProductChanges,
	V1_2_InvoiceChange,
	V1_2_TrialsUsedChange,
	V1_2_CheckChange,
	V1_2_CheckQueryChange,
	V1_2_TrackChange,
	V1_2_TrackParamsChange,
	V1_2_AttachParamsChange,
	V1_2_UpdateSubscriptionParamsChange,

	V1_2_FeatureChange,
	V1_2_CreateFeatureChange,
];

export const V1_4_CHANGES: VersionChangeConstructor[] = [];

export const V1_2_CHANGES: VersionChangeConstructor[] = [
	V1_1_FeaturesArrayToObject,
];

export const V1_1_CHANGES: VersionChangeConstructor[] = [
	V0_2_CustomerChange,
	V0_2_InvoicesAlwaysExpanded,
	V0_2_CheckChange,
	V0_2_AttachChange,
];

export const V0_2_CHANGES: VersionChangeConstructor[] = [V0_1_CustomerChange];

export const V0_1_CHANGES: VersionChangeConstructor[] = [];

export function registerAllVersionChanges() {
	VersionChangeRegistryClass.register({
		version: ApiVersion.V2_5,
		changes: V2_5_CHANGES,
	});
	VersionChangeRegistryClass.register({
		version: ApiVersion.V2_4,
		changes: V2_4_CHANGES,
	});
	VersionChangeRegistryClass.register({
		version: ApiVersion.V2_3,
		changes: V2_3_CHANGES,
	});
	VersionChangeRegistryClass.register({
		version: ApiVersion.V2_2,
		changes: V2_2_CHANGES,
	});
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

registerAllVersionChanges();

export {
	V0_2_InvoicesAlwaysExpanded,
	V1_2_CheckQueryChange,
	V2_3_CustomerEntityData,
};
