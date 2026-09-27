import type { Entitlement, Feature, Price, Product } from "@autumn/shared";
import type { MeteringIdentity } from "../identity/meteringIdentity.js";
import type { WorkerCustomer } from "./rows/workerCustomer.js";
import type { WorkerCustomerEntitlement } from "./rows/workerCustomerEntitlement.js";
import type { WorkerCustomerPrice } from "./rows/workerCustomerPrice.js";
import type { WorkerCustomerProduct } from "./rows/workerCustomerProduct.js";
import type { WorkerEntity } from "./rows/workerEntity.js";
import type { OpenLock } from "./rows/workerLock.js";
import type { WorkerPooledBalance } from "./rows/workerPooledBalance.js";
import type { WorkerReplaceable } from "./rows/workerReplaceable.js";
import type { WorkerRollover } from "./rows/workerRollover.js";
import type { WorkerUsageWindow } from "./rows/workerUsageWindow.js";

/** A state row joined with the catalog rows it references: the shape the shared balance helpers read. */
export type WorkerFullCustomerEntitlement = WorkerCustomerEntitlement & {
	entitlement: Entitlement & { feature: Feature };
	rollovers: WorkerRollover[];
	/** A v1 allocated grant's; the API balance folds their count in. */
	replaceables: WorkerReplaceable[];
	/** The pool a pooled row draws from, joined by `pooled_balance_id`; null on every other row. */
	pooled_balance?: WorkerPooledBalance;
};

export type WorkerFullCustomerPrice = WorkerCustomerPrice & { price: Price };

export type WorkerFullCustomerProduct = WorkerCustomerProduct & {
	product: Product;
	customer_prices: WorkerFullCustomerPrice[];
	customer_entitlements: WorkerFullCustomerEntitlement[];
};

/** A selected row with the product the selection attached, or null for a loose grant. */
export type WorkerFullCustomerEntitlementWithProduct =
	WorkerFullCustomerEntitlement & {
		customer_product: WorkerFullCustomerProduct | null;
	};

/** FullSubject as the worker holds it: the same nesting, only the tables state carries; `entity` is the view the command names. */
export type WorkerFullSubject = {
	identity: MeteringIdentity;
	revision: number;
	customer: WorkerCustomer;
	entity: WorkerEntity | null;
	customer_products: WorkerFullCustomerProduct[];
	extra_customer_entitlements: WorkerFullCustomerEntitlement[];
	/** The customer's pools: customer-level rows every entity draws from, kept apart the way the server's FullSubject keeps them. */
	pooled_customer_entitlements: WorkerFullCustomerEntitlement[];
	/** Windowed-cap counters, customer-scoped or the entity's own. */
	usage_windows: WorkerUsageWindow[];
	/** The customer's open locks, ids only: what a lock decision refuses a duplicate against. */
	open_locks: OpenLock[];
};
