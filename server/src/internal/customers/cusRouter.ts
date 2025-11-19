import express from "express";
import { Hono } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { handleAddCouponToCusV2 } from "./handlers/handleAddCouponToCusV2.js";
import { handleCreateBillingPortal } from "./handlers/handleBillingPortal/handleCreateBillingPortal.js";
import { handleGetBillingPortal } from "./handlers/handleBillingPortal/handleGetBillingPortal.js";
import { handleDeleteCustomerV2 } from "./handlers/handleDeleteCustomerV2.js";
import { handleGetCustomerV2 } from "./handlers/handleGetCustomerV2.js";
import { handleListCustomers } from "./handlers/handleListCustomers.js";
import { handlePostCustomer } from "./handlers/handlePostCustomerV2.js";
import { handleTransferProductV2 } from "./handlers/handleTransferProductV2.js";
import { handleUpdateBalancesV2 } from "./handlers/handleUpdateBalancesV2.js";
import { handleUpdateCusEntitlementV2 } from "./handlers/handleUpdateCusEntitlementV2.js";
import { handleUpdateCustomerV2 } from "./handlers/handleUpdateCustomerV2.js";

export const expressCusRouter = express.Router();
expressCusRouter.get("/:customer_id/billing_portal", handleGetBillingPortal);

export const cusRouter = new Hono<HonoEnv>();

cusRouter.get("", ...handleListCustomers);
cusRouter.post("", ...handlePostCustomer);
cusRouter.get("/:customer_id", ...handleGetCustomerV2);
cusRouter.post("/:customer_id", ...handleUpdateCustomerV2);
cusRouter.patch("/:customer_id", ...handleUpdateCustomerV2);
cusRouter.delete("/:customer_id", ...handleDeleteCustomerV2);

cusRouter.post("/:customer_id/coupons/:coupon_id", ...handleAddCouponToCusV2);
cusRouter.post("/:customer_id/transfer", ...handleTransferProductV2);

// Billing portal
cusRouter.post("/:customer_id/billing_portal", ...handleCreateBillingPortal);
// cusRouter.get("/:customer_id/billing_portal", ...handleCreateBillingPortal);

// Legacy...
cusRouter.post("/:customer_id/balances", ...handleUpdateBalancesV2);
cusRouter.post(
	"/:customer_id/entitlements/:customer_entitlement_id",
	...handleUpdateCusEntitlementV2,
);
