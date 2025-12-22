import type { ExistingRollover } from "@models/billingModels/existingRollovers";
import type { FreeTrial } from "@models/productModels/freeTrialModels/freeTrialModels";
import type { ApiVersion } from "../../api/versionUtils/ApiVersion";
import type { FullCustomer } from "../cusModels/fullCusModel";
import type {
	CollectionMethod,
	CusProductStatus,
} from "../cusProductModels/cusProductEnums";
import type { FeatureOptions } from "../cusProductModels/cusProductModels";
import type { FullProduct } from "../productModels/productModels";
import type { ExistingUsages } from "./existingUsages";

export interface InitFullCustomerProductContext {
	fullCustomer: FullCustomer;
	fullProduct: FullProduct;
	featureQuantities: FeatureOptions[];

	// For customer entitlements
	resetCycleAnchor: number | "now"; // Unix timestamp of the next
	existingUsages?: ExistingUsages;
	existingRollovers?: ExistingRollover[];

	// Others
	freeTrial: FreeTrial | null;
	trialEndsAt?: number;
	now: number; // milliseconds since epoch
}

export interface InitFullCustomerProductOptions {
	subscriptionId?: string;
	subscriptionScheduleId?: string;
	isCustom?: boolean;
	canceledAt?: number;
	status?: CusProductStatus; // Used for scheduling product
	startsAt?: number; // Used for scheduling product

	// Optional + random
	apiSemver?: ApiVersion;
	collectionMethod?: CollectionMethod;
}
