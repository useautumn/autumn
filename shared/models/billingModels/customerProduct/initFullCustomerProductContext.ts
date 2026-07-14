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
}

export interface ExistingRolloversConfig {
	fromCustomerProduct: FullCusProduct;
}

export interface InitFullCustomerProductContext {
	fullCustomer: FullCustomer;
	fullProduct: FullProduct;
	featureQuantities: FeatureOptions[];
	customerLicenseQuantities?: CustomerLicenseQuantity[];

	/**
	 * Per-call override for the entity the resulting cusProduct should bind to.
	 * Wins over `fullCustomer.entity`. Used by flows (e.g. sync) where the
	 * entity is plan-specific rather than request-wide.
	 */
	entity?: Entity;

	// For customer entitlements
	billingCycleAnchor?: number | "now";
	resetCycleAnchor: number | "now"; // Unix timestamp of the next
	// existingUsages?: ExistingUsages;
	// existingRollovers?: ExistingRollover[];

	// Others
	freeTrial: FreeTrial | null;
	trialEndsAt?: number;
	now: number; // milliseconds since epoch
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
	isCustom?: boolean;
	canceledAt?: number;
	status?: CusProductStatus; // Used for scheduling product
	startsAt?: number; // Used for scheduling product
	accessStartsAt?: number;
	endedAt?: number; // Used for scheduling product

	// Optional + random
	apiSemver?: ApiVersion;
	collectionMethod?: CollectionMethod;
	externalId?: string;
	billingCycleAnchorResetsAt?: number | null;

	/** When true, preserve subscription_ids even for non-paid-recurring products (used by sync). */
	keepSubscriptionIds?: boolean;

	/** Marks the product as a license assignment under this parent: entitlements
	 * are entity-stamped and prices are dropped — assignments never bill, and
	 * usage_allowed must not derive from prices the product won't charge. */
	licenseParentCustomerProductId?: string;

	/** Override the entity the customer product is bound to. Used by sync to honor `plan.internal_entity_id` instead of falling back to `fullCustomer.entity`. */
	internalEntityId?: string;

	previousCustomerProductId?: string;
	onTrialEnd?: TrialOnEnd;

	/**
	 * Tags the customer_product's `processor.type` field. When omitted, the
	 * processor column is left unwritten (defaults to null in the DB, which
	 * `cusProductToProcessorType` resolves to Stripe). Used by non-Stripe
	 * origin flows (e.g. RevenueCat) to mark cus_products explicitly.
	 */
	processorType?: ProcessorType;
}
