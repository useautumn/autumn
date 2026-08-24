import type { customerEntitlements } from "../../../sqlite/common/schema/customerEntitlements.js";
import type { customerProducts } from "../../../sqlite/common/schema/customerProducts.js";
import type { customers } from "../../../sqlite/common/schema/customers.js";
import type { entitlements } from "../../../sqlite/common/schema/entitlements.js";
import type { features } from "../../../sqlite/common/schema/features.js";
import type { products } from "../../../sqlite/common/schema/products.js";

// Postgres rows fetched for one subject, ready for the shard's sqlite. Held
// until the writer loop is between transactions.
export type SubjectImport = {
	key: string;
	internalCustomerId: string;
	// The journal version the projection has already applied for this subject.
	version: number;
	customers: (typeof customers.$inferInsert)[];
	customerProducts: (typeof customerProducts.$inferInsert)[];
	customerEntitlements: (typeof customerEntitlements.$inferInsert)[];
	entitlements: (typeof entitlements.$inferInsert)[];
	features: (typeof features.$inferInsert)[];
	products: (typeof products.$inferInsert)[];
};
