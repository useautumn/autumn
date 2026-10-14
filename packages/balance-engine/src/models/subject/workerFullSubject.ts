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

export type WorkerFullCustomerEntitlement = WorkerCustomerEntitlement & {
	entitlement: Entitlement & { feature: Feature };
	rollovers: WorkerRollover[];
	replaceables: WorkerReplaceable[];
	pooled_balance?: WorkerPooledBalance;
};

export type WorkerFullCustomerPrice = WorkerCustomerPrice & { price: Price };

export type WorkerFullCustomerProduct = WorkerCustomerProduct & {
	product: Product;
	customer_prices: WorkerFullCustomerPrice[];
	customer_entitlements: WorkerFullCustomerEntitlement[];
};

export type WorkerFullCustomerEntitlementWithProduct =
	WorkerFullCustomerEntitlement & {
		customer_product: WorkerFullCustomerProduct | null;
	};

export type WorkerFullSubject = {
	identity: MeteringIdentity;
	revision: number;
	customer: WorkerCustomer;
	entity: WorkerEntity | null;
	customer_products: WorkerFullCustomerProduct[];
	extra_customer_entitlements: WorkerFullCustomerEntitlement[];
	pooled_customer_entitlements: WorkerFullCustomerEntitlement[];
	usage_windows: WorkerUsageWindow[];
	open_locks: OpenLock[];
};
