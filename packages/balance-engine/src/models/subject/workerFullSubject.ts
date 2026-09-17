import type { Entitlement, Feature, Product } from "@autumn/shared";
import type { MeteringIdentity } from "../meteringIdentity.js";
import type { WorkerCustomerEntitlement } from "../rows/workerCustomerEntitlement.js";
import type { WorkerCustomerProduct } from "../rows/workerCustomerProduct.js";
import type { WorkerEntity } from "../rows/workerEntity.js";
import type { WorkerRollover } from "../rows/workerRollover.js";

/** A state row joined with the catalog rows it references: the shape the shared balance helpers read. */
export type WorkerFullCustomerEntitlement = WorkerCustomerEntitlement & {
	entitlement: Entitlement & { feature: Feature };
	rollovers: WorkerRollover[];
};

export type WorkerFullCustomerProduct = WorkerCustomerProduct & {
	product: Product;
	customer_entitlements: WorkerFullCustomerEntitlement[];
};

/**
 * FullSubject as the worker holds it: the same nesting, only the tables state carries.
 * `entity` is the view the command names; `entities` are all the customer's.
 */
export type WorkerFullSubject = {
	identity: MeteringIdentity;
	revision: number;
	entity: WorkerEntity | null;
	entities: WorkerEntity[];
	customer_products: WorkerFullCustomerProduct[];
	extra_customer_entitlements: WorkerFullCustomerEntitlement[];
};
