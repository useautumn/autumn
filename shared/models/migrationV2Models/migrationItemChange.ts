import type { CusProductStatus } from "../cusProductModels/cusProductEnums.js";
import type { EntitlementWithFeature } from "../productModels/entModels/entModels.js";
import type { FullProductWithoutLicenses } from "../productModels/productModels.js";

/** The changed customer product as it stood when the migration wrote it;
 * webhook plan snapshots are built from it. */
export type MigrationChangedCustomerProduct = {
	customerProductId: string;
	/** Public id of the owning entity when the customer product is entity-level. */
	entityId: string | null;
	status: CusProductStatus;
	startsAt: number | null;
	canceledAt: number | null;
	endedAt: number | null;
	trialEndsAt: number | null;
};

export type MigrationEntitlementCreated = MigrationChangedCustomerProduct & {
	kind: "entitlement_created";
	planId: string;
	featureId: string;
	entitlement: EntitlementWithFeature;
	isOneOff: boolean;
	granted: number | null;
	/** After-write remaining; omitted when it equals granted. */
	remaining?: number | null;
	unlimited: boolean;
	nextResetAt: number | null;
};

/** Balance fields are the before-state, set when the deletion is the
 * from-half of a replace. */
export type MigrationEntitlementDeleted = MigrationChangedCustomerProduct & {
	kind: "entitlement_deleted";
	planId: string;
	featureId: string;
	entitlement: EntitlementWithFeature;
	isOneOff: boolean;
	granted?: number | null;
	remaining?: number | null;
	unlimited?: boolean;
	nextResetAt?: number | null;
};

export type MigrationCustomerProductRepointed =
	MigrationChangedCustomerProduct & {
		kind: "customer_product_repointed";
		fromProduct: FullProductWithoutLicenses;
		toProduct: FullProductWithoutLicenses;
	};

/** Carries no diff on purpose: a pool repoint alone only busts the cache and
 * succeeds the customer; item diffs come from the license entitlement changes. */
export type MigrationLicensePoolRepointed = {
	kind: "license_pool_repointed";
};

/** One committed change a batch migration made to a customer, held on its
 * item run until the change's effects (cache, item event, webhook) are published. */
export type MigrationItemChange =
	| MigrationEntitlementCreated
	| MigrationEntitlementDeleted
	| MigrationCustomerProductRepointed
	| MigrationLicensePoolRepointed;
