import { Hono } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { handleGetCustomer } from "@/internal/customers/internalHandlers/handleGetCustomer.js";
import { handleGetCusReferrals } from "./internalHandlers/handleGetCusReferrals.js";
import { handleGetCustomerEvents } from "./internalHandlers/handleGetCustomerEvents.js";
import { handleGetCustomerProduct } from "./internalHandlers/handleGetCustomerProduct.js";
import { handleGetFullCustomers } from "./internalHandlers/handleGetFullCustomers.js";
import { handleSearchCustomers } from "./internalHandlers/handleSearchCustomers.js";

export const internalCusRouter = new Hono<HonoEnv>();

internalCusRouter.post("/all/search", ...handleSearchCustomers);
internalCusRouter.post("/all/full_customers", ...handleGetFullCustomers);
internalCusRouter.get("/:customer_id", ...handleGetCustomer);
internalCusRouter.get("/:customer_id/events", ...handleGetCustomerEvents);
internalCusRouter.get(
	"/:customer_id/product/:product_id",
	...handleGetCustomerProduct,
);
internalCusRouter.get("/:customer_id/referrals", ...handleGetCusReferrals);
