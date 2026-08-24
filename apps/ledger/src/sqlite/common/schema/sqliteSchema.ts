import { customerEntitlements } from "./customerEntitlements.js";
import { customerProducts } from "./customerProducts.js";
import { customers } from "./customers.js";
import { entitlements } from "./entitlements.js";
import { features } from "./features.js";
import { products } from "./products.js";
import { serials } from "./serials.js";
import { subjectVersions } from "./subjectVersions.js";
import { toCreateTableDdl } from "./toCreateTableDdl.js";

export const schema = {
	customerEntitlements,
	customerProducts,
	customers,
	entitlements,
	features,
	products,
	serials,
	subjectVersions,
};

export const tableDdl = Object.values(schema).map((table) =>
	toCreateTableDdl({ table }),
);
