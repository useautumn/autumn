import { Hono } from "hono";
import type { HonoEnv } from "../../honoUtils/HonoEnv";
import { handleGetAdminCustomerBlockConfig } from "./handleGetAdminCustomerBlockConfig";
import { handleGetAdminEdgeConfigSources } from "./handleGetAdminEdgeConfigSources";
import { handleGetAdminFeatureFlagsConfig } from "./handleGetAdminFeatureFlagsConfig";
import { handleGetAdminJobQueueConfig } from "./handleGetAdminJobQueueConfig";
import { handleGetAdminOrgLimitsConfig } from "./handleGetAdminOrgLimitsConfig";
import { handleGetAdminOrgRequestBlock } from "./handleGetAdminOrgRequestBlock";
import { handleGetAdminRequestBlockConfig } from "./handleGetAdminRequestBlockConfig";
import { handleGetAdminRedisV2CacheConfig } from "./handleGetAdminRedisV2CacheConfig";
import { handleGetAdminStripeSyncConfig } from "./handleGetAdminStripeSyncConfig";

import { handleGetInvoiceLineItems } from "./handleGetInvoiceLineItems";
import { handleGetMasterStripeAccount } from "./handleGetMasterStripeAccount";
import { handleGetOrgMember } from "./handleGetOrgMember";
import { handleListAdminOrgs } from "./handleListAdminOrgs";
import { handleListAdminUsers } from "./handleListAdminUsers";
import { handleListOAuthClients } from "./handleListOAuthClients";
import { handleUpsertAdminCustomerBlockConfig } from "./handleUpsertAdminCustomerBlockConfig";
import { handleUpsertAdminFeatureFlagsConfig } from "./handleUpsertAdminFeatureFlagsConfig";
import { handleUpsertAdminJobQueueConfig } from "./handleUpsertAdminJobQueueConfig";
import { handleUpsertAdminOrgLimitsConfig } from "./handleUpsertAdminOrgLimitsConfig";
import { handleUpsertAdminOrgRequestBlock } from "./handleUpsertAdminOrgRequestBlock";
import { handleUpsertAdminRequestBlockConfig } from "./handleUpsertAdminRequestBlockConfig";
import { handleUpsertAdminRedisV2CacheConfig } from "./handleUpsertAdminRedisV2CacheConfig";
import { handleUpsertAdminStripeSyncConfig } from "./handleUpsertAdminStripeSyncConfig";
import { handleDeleteRollout } from "./rollouts/handleDeleteRollout";
import { handleDeleteRolloutOrg } from "./rollouts/handleDeleteRolloutOrg";
import { handleGetRollouts } from "./rollouts/handleGetRollouts";
import { handleUpdateRollout } from "./rollouts/handleUpdateRollout";
import { handleUpdateRolloutOrg } from "./rollouts/handleUpdateRolloutOrg";

export const honoAdminRouter = new Hono<HonoEnv>();

honoAdminRouter.get("/users", ...handleListAdminUsers);
honoAdminRouter.get("/orgs", ...handleListAdminOrgs);
honoAdminRouter.get("/edge-config-sources", ...handleGetAdminEdgeConfigSources);
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
honoAdminRouter.get("/org-limits-config", ...handleGetAdminOrgLimitsConfig);
honoAdminRouter.put("/org-limits-config", ...handleUpsertAdminOrgLimitsConfig);
honoAdminRouter.get("/job-queue-config", ...handleGetAdminJobQueueConfig);
honoAdminRouter.put("/job-queue-config", ...handleUpsertAdminJobQueueConfig);
honoAdminRouter.get("/stripe-sync-config", ...handleGetAdminStripeSyncConfig);
honoAdminRouter.put(
	"/stripe-sync-config",
	...handleUpsertAdminStripeSyncConfig,
);
honoAdminRouter.get(
	"/redis-v2-cache-config",
	...handleGetAdminRedisV2CacheConfig,
);
honoAdminRouter.put(
	"/redis-v2-cache-config",
	...handleUpsertAdminRedisV2CacheConfig,
);
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
honoAdminRouter.delete("/rollouts/:rollout_id", ...handleDeleteRollout);
honoAdminRouter.delete(
	"/rollouts/:rollout_id/orgs/:org_id",
	...handleDeleteRolloutOrg,
);
