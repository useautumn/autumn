import type { ApiVersion } from "../../api/versionUtils/ApiVersion";
import type { FullCustomer } from "../cusModels/fullCusModel";
import type { AttachReplaceable } from "../cusProductModels/cusEntModels/replaceableSchema";
import type {
	CollectionMethod,
	CusProductStatus,
} from "../cusProductModels/cusProductEnums";
import type { FeatureOptions } from "../cusProductModels/cusProductModels";
import type { FullProduct } from "../productModels/productModels";

export interface InsertFullCusProductContext {
	fullCus: FullCustomer;
	product: FullProduct;
	featureQuantities: FeatureOptions[];
	replaceables: AttachReplaceable[];
}

export interface InsertCusProductOptions {
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
