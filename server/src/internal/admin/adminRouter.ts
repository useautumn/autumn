import { Hono } from "hono";
import type { HonoEnv } from "../../honoUtils/HonoEnv";
import { handleGetInvoiceLineItems } from "./handleGetInvoiceLineItems";
import { handleGetAdminOrgRequestBlock } from "./handleGetAdminOrgRequestBlock";
import { handleGetMasterStripeAccount } from "./handleGetMasterStripeAccount";
import { handleGetOrgMember } from "./handleGetOrgMember";
import { handleListAdminOrgs } from "./handleListAdminOrgs";
import { handleListAdminUsers } from "./handleListAdminUsers";
import { handleListOAuthClients } from "./handleListOAuthClients";
import { handleUpsertAdminOrgRequestBlock } from "./handleUpsertAdminOrgRequestBlock";
import { handleDeleteRolloutOrg } from "./rollouts/handleDeleteRolloutOrg";
import { handleGetRollouts } from "./rollouts/handleGetRollouts";
import { handleUpdateRollout } from "./rollouts/handleUpdateRollout";
import { handleUpdateRolloutOrg } from "./rollouts/handleUpdateRolloutOrg";

export const honoAdminRouter = new Hono<HonoEnv>();

honoAdminRouter.get("/users", ...handleListAdminUsers);
honoAdminRouter.get("/orgs", ...handleListAdminOrgs);
honoAdminRouter.get("/orgs/:org_id/request-block", ...handleGetAdminOrgRequestBlock);
honoAdminRouter.put("/orgs/:org_id/request-block", ...handleUpsertAdminOrgRequestBlock);
honoAdminRouter.get("/org-member", ...handleGetOrgMember);
honoAdminRouter.get("/master-stripe-account", ...handleGetMasterStripeAccount);
honoAdminRouter.get("/oauth-clients", ...handleListOAuthClients);
honoAdminRouter.post("/invoice-line-items", ...handleGetInvoiceLineItems);

honoAdminRouter.get("/rollouts", ...handleGetRollouts);
honoAdminRouter.put("/rollouts/:rollout_id", ...handleUpdateRollout);
honoAdminRouter.put(
	"/rollouts/:rollout_id/orgs/:org_id",
	...handleUpdateRolloutOrg,
);
honoAdminRouter.delete(
	"/rollouts/:rollout_id/orgs/:org_id",
	...handleDeleteRolloutOrg,
);
