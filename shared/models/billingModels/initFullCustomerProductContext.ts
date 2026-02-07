import type { FreeTrial } from "@models/productModels/freeTrialModels/freeTrialModels";
import type { ApiVersion } from "../../api/versionUtils/ApiVersion";
import type { FullCustomer } from "../cusModels/fullCusModel";
import type {
	CollectionMethod,
	CusProductStatus,
} from "../cusProductModels/cusProductEnums";
import type {
	FeatureOptions,
	FullCusProduct,
} from "../cusProductModels/cusProductModels";
import type { FullProduct } from "../productModels/productModels";

export interface ExistingUsagesConfig {
	fromCustomerProduct: FullCusProduct;
	carryAllConsumableFeatures?: boolean;
	consumableFeatureIdsToCarry?: string[];
}

export interface ExistingRolloversConfig {
	fromCustomerProduct: FullCusProduct;
}

export interface InitFullCustomerProductContext {
	fullCustomer: FullCustomer;
	fullProduct: FullProduct;
	featureQuantities: FeatureOptions[];

	// For customer entitlements
	resetCycleAnchor: number | "now"; // Unix timestamp of the next

	// Others
	freeTrial: FreeTrial | null;
	trialEndsAt?: number;
	now: number; // milliseconds since epoch

	existingUsagesConfig?: ExistingUsagesConfig;

	existingRolloversConfig?: ExistingRolloversConfig;
}

export interface InitFullCustomerProductOptions {
	subscriptionId?: string;
	subscriptionScheduleId?: string;
	isCustom?: boolean;
	canceledAt?: number;
	status?: CusProductStatus; // Used for scheduling product
	startsAt?: number; // Used for scheduling product
	endedAt?: number; // Used for scheduling product

	// Optional + random
	apiSemver?: ApiVersion;
	collectionMethod?: CollectionMethod;
}
