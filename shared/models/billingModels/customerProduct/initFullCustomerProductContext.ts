import type { BillingVersion } from "@models/billingModels/context/billingContext";
import type { TransitionConfig } from "@models/billingModels/context/transitionConfig";
import type {
	FreeTrial,
	TrialOnEnd,
} from "@models/productModels/freeTrialModels/freeTrialModels";
import type { ApiVersion } from "../../../api/versionUtils/ApiVersion";
import type { Entity } from "../../cusModels/entityModels/entityModels";
import type { FullCustomer } from "../../cusModels/fullCusModel";
import type {
	CollectionMethod,
	CusProductStatus,
} from "../../cusProductModels/cusProductEnums";
import type {
	CusProduct,
	FeatureOptions,
	FullCusProduct,
} from "../../cusProductModels/cusProductModels";
import type { ProcessorType } from "../../genModels/genEnums";
import type { FullProduct } from "../../productModels/productModels";
import type { CustomerLicenseQuantity } from "../customerLicenseQuantity";

export interface ExistingUsagesConfig {
	fromCustomerProduct: FullCusProduct;
	carryAllConsumableFeatures?: boolean;
	consumableFeatureIdsToCarry?: string[];
	carryUnlimitedUsage?: boolean;
}

export interface ExistingRolloversConfig {
	fromCustomerProduct: FullCusProduct;
}

export interface InitFullCustomerProductContext {
	fullCustomer: FullCustomer;
	fullProduct: FullProduct;
	featureQuantities: FeatureOptions[];
	customerLicenseQuantities?: CustomerLicenseQuantity[];

	entity?: Entity;

	billingCycleAnchor?: number | "now";
	resetCycleAnchor: number | "now";
	freeTrial: FreeTrial | null;
	trialEndsAt?: number;
	now: number;
	billingVersion?: BillingVersion;

	existingUsagesConfig?: ExistingUsagesConfig;

	existingRolloversConfig?: ExistingRolloversConfig;

	transitionConfig?: TransitionConfig;
}

export interface InitCustomerEntitlementContext {
	fullCustomer: FullCustomer;
	fullProduct?: FullProduct;
	featureQuantities: FeatureOptions[];
	resetCycleAnchor: number | "now";
	freeTrial: FreeTrial | null;
	now: number;

	trialEndsAt?: number;
	transitionConfig?: TransitionConfig;
}

export interface InitFullCustomerProductOptions {
	subscriptionId?: string;
	subscriptionScheduleId?: string;
	canceledAt?: number;
	status?: CusProductStatus;
	startsAt?: number;
	accessStartsAt?: number;
	endedAt?: number;
	apiSemver?: ApiVersion;
	collectionMethod?: CollectionMethod;
	externalId?: string;
	billingCycleAnchorResetsAt?: number | null;

	keepSubscriptionIds?: boolean;

	customerLicenseLinkId?: string;

	internalEntityId?: string;

	previousCustomerProductId?: string;
	onTrialEnd?: TrialOnEnd;

	processorType?: ProcessorType;

	processor?: CusProduct["processor"];
}
