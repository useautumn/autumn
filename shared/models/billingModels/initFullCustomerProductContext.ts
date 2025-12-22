import type { ExistingRollover } from "@models/billingModels/existingRollovers";
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
	existingUsages?: ExistingUsages;
	existingRollovers?: ExistingRollover[];
}

export interface InitFullCustomerProductOptions {
	subscriptionId?: string;
	subscriptionScheduleId?: string;
	isCustom?: boolean;
	resetCycleAnchor?: number; // Unix timestamp of the next
	canceledAt?: number;
	status?: CusProductStatus; // Used for scheduling product
	startsAt?: number; // Used for scheduling product

	// Optional + random
	apiSemver?: ApiVersion;
	collectionMethod?: CollectionMethod;
}
