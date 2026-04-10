import { Hono } from "hono";
import type { HonoEnv } from "../../honoUtils/HonoEnv";
import { handleGetAdminCustomerBlockConfig } from "./handleGetAdminCustomerBlockConfig";
import { handleGetAdminFeatureFlagsConfig } from "./handleGetAdminFeatureFlagsConfig";
import { handleGetAdminOrgRequestBlock } from "./handleGetAdminOrgRequestBlock";
import { handleGetAdminRequestBlockConfig } from "./handleGetAdminRequestBlockConfig";
import { handleGetInvoiceLineItems } from "./handleGetInvoiceLineItems";
import { handleGetMasterStripeAccount } from "./handleGetMasterStripeAccount";
import { handleGetOrgMember } from "./handleGetOrgMember";
import { handleListAdminOrgs } from "./handleListAdminOrgs";
import { handleListAdminUsers } from "./handleListAdminUsers";
import { handleListOAuthClients } from "./handleListOAuthClients";
import { handleUpsertAdminCustomerBlockConfig } from "./handleUpsertAdminCustomerBlockConfig";
import { handleUpsertAdminFeatureFlagsConfig } from "./handleUpsertAdminFeatureFlagsConfig";
import { handleUpsertAdminOrgRequestBlock } from "./handleUpsertAdminOrgRequestBlock";
import { handleUpsertAdminRequestBlockConfig } from "./handleUpsertAdminRequestBlockConfig";

export const honoAdminRouter = new Hono<HonoEnv>();

honoAdminRouter.get("/users", ...handleListAdminUsers);
honoAdminRouter.get("/orgs", ...handleListAdminOrgs);
honoAdminRouter.get(
	"/orgs/:org_id/request-block",
	...handleGetAdminOrgRequestBlock,
);
honoAdminRouter.put(
	"/orgs/:org_id/request-block",
	...handleUpsertAdminOrgRequestBlock,
);
honoAdminRouter.get(
	"/request-block-config",
	...handleGetAdminRequestBlockConfig,
);
honoAdminRouter.put(
	"/request-block-config",
	...handleUpsertAdminRequestBlockConfig,
);
honoAdminRouter.get(
	"/feature-flags-config",
	...handleGetAdminFeatureFlagsConfig,
);
honoAdminRouter.put(
	"/feature-flags-config",
	...handleUpsertAdminFeatureFlagsConfig,
);
honoAdminRouter.get(
	"/customer-block-config",
	...handleGetAdminCustomerBlockConfig,
);
honoAdminRouter.put(
	"/customer-block-config",
	...handleUpsertAdminCustomerBlockConfig,
);
honoAdminRouter.get("/org-member", ...handleGetOrgMember);
honoAdminRouter.get("/master-stripe-account", ...handleGetMasterStripeAccount);
honoAdminRouter.get("/oauth-clients", ...handleListOAuthClients);
honoAdminRouter.post("/invoice-line-items", ...handleGetInvoiceLineItems);
