import { Hono } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { handleGetCustomer } from "@/internal/customers/internalHandlers/handleGetCustomer.js";
import { handleClearCustomerCache } from "./handlers/handleClearCustomerCache.js";
import { handleListCustomerProducts } from "./handlers/handleListCustomerProducts.js";
import { handleCountCustomers } from "./internalHandlers/handleCountCustomers.js";
import { handleCreateCustomerExport } from "./internalHandlers/handleCreateCustomerExport.js";
import { handleDownloadCustomerExport } from "./internalHandlers/handleDownloadCustomerExport.js";
import { handleGetCusReferrals } from "./internalHandlers/handleGetCusReferrals.js";
import { handleGetCustomerProduct } from "./internalHandlers/handleGetCustomerProduct.js";
import { handleGetCustomerSchedule } from "./internalHandlers/handleGetCustomerSchedule.js";
import { handleGetFullCustomers } from "./internalHandlers/handleGetFullCustomers.js";
import { handleGetInvoiceLineItems } from "./internalHandlers/handleGetInvoiceLineItems.js";
import { handleListCustomerExports } from "./internalHandlers/handleListCustomerExports.js";
import { handleListEntitiesInternal } from "./internalHandlers/handleListEntitiesInternal.js";
import { handleSearchCustomers } from "./internalHandlers/handleSearchCustomers.js";

export const internalCusRouter = new Hono<HonoEnv>();

internalCusRouter.post("/all/search", ...handleSearchCustomers);
internalCusRouter.post("/all/full_customers", ...handleGetFullCustomers);
internalCusRouter.post("/all/count", ...handleCountCustomers);
internalCusRouter.post("/clear_cache", ...handleClearCustomerCache);
// Registered before /:customer_id so "exports" is never read as a customer id.
internalCusRouter.post("/exports", ...handleCreateCustomerExport);
internalCusRouter.get("/exports", ...handleListCustomerExports);
internalCusRouter.post(
	"/exports/:export_id/download",
	...handleDownloadCustomerExport,
);
internalCusRouter.get("/:customer_id/products", ...handleListCustomerProducts);
internalCusRouter.get("/:customer_id", ...handleGetCustomer);
internalCusRouter.get(
	"/:customer_id/product/:product_id",
	...handleGetCustomerProduct,
);
internalCusRouter.get("/:customer_id/referrals", ...handleGetCusReferrals);
internalCusRouter.get("/:customer_id/schedule", ...handleGetCustomerSchedule);
internalCusRouter.get("/:customer_id/entities", ...handleListEntitiesInternal);
internalCusRouter.post(
	"/:customer_id/invoice-line-items",
	...handleGetInvoiceLineItems,
);
