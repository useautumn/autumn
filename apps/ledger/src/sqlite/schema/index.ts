import { customerEntitlements } from "./customerEntitlements.js";
import { customerProducts } from "./customerProducts.js";
import { customers } from "./customers.js";
import { serials } from "./serials.js";
import { toCreateTableDdl } from "./toCreateTableDdl.js";

export const schema = {
	customerEntitlements,
	customerProducts,
	customers,
	serials,
};

export const tableDdl = Object.values(schema).map((table) =>
	toCreateTableDdl({ table }),
);
