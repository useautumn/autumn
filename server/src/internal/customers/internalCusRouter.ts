import { Hono } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { handleGetCustomer } from "@/internal/customers/internalHandlers/handleGetCustomer.js";
import { handleCountCustomers } from "./internalHandlers/handleCountCustomers.js";
import { handleGetCusReferrals } from "./internalHandlers/handleGetCusReferrals.js";
import { handleGetCustomerProduct } from "./internalHandlers/handleGetCustomerProduct.js";
import { handleGetCustomerSchedule } from "./internalHandlers/handleGetCustomerSchedule.js";
import { handleGetFullCustomers } from "./internalHandlers/handleGetFullCustomers.js";
import { handleGetInvoiceLineItems } from "./internalHandlers/handleGetInvoiceLineItems.js";
import { handleListEntitiesInternal } from "./internalHandlers/handleListEntitiesInternal.js";
import { handleSearchCustomers } from "./internalHandlers/handleSearchCustomers.js";

export const internalCusRouter = new Hono<HonoEnv>();

internalCusRouter.post("/all/search", ...handleSearchCustomers);
internalCusRouter.post("/all/full_customers", ...handleGetFullCustomers);
internalCusRouter.post("/all/count", ...handleCountCustomers);
internalCusRouter.get("/:customer_id", ...handleGetCustomer);
internalCusRouter.get(
	"/:customer_id/product/:product_id",
	...handleGetCustomerProduct,
);
internalCusRouter.get("/:customer_id/referrals", ...handleGetCusReferrals);
internalCusRouter.get("/:customer_id/schedule", ...handleGetCustomerSchedule);
internalCusRouter.get(
	"/:customer_id/entities",
	...handleListEntitiesInternal,
);
internalCusRouter.post(
	"/:customer_id/invoice-line-items",
	...handleGetInvoiceLineItems,
);
