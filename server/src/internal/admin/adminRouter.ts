import { Hono } from "hono";
import type { HonoEnv } from "../../honoUtils/HonoEnv";
import {
	handleDeleteAdminCacheV2Ramp,
	handleGetAdminCacheV2Ramp,
	handleUpdateAdminCacheV2RampMigration,
	handleUpsertAdminCacheV2Ramp,
} from "./handleAdminCacheV2Ramp";
import {
	handleDeleteAdminOrgRedisConfig,
	handleGetAdminOrgRedisConfig,
	handleUpdateAdminOrgRedisMigration,
	handleUpdateAdminOrgRedisPublicUrl,
	handleUpsertAdminOrgRedisConfig,
} from "./handleAdminOrgRedisConfig";
import { handleGetAdminCustomerBlockConfig } from "./handleGetAdminCustomerBlockConfig";
import { handleGetAdminEdgeConfigSources } from "./handleGetAdminEdgeConfigSources";
import { handleGetAdminFeatureFlagsConfig } from "./handleGetAdminFeatureFlagsConfig";
import { handleGetAdminFullSubjectGateConfig } from "./handleGetAdminFullSubjectGateConfig";
import { handleGetAdminJobQueueConfig } from "./handleGetAdminJobQueueConfig";
import { handleGetAdminMiscellaneousEdgeConfig } from "./handleGetAdminMiscellaneousEdgeConfig";
import { handleGetAdminOrgLimitsConfig } from "./handleGetAdminOrgLimitsConfig";
import { handleGetAdminOrgRequestBlock } from "./handleGetAdminOrgRequestBlock";
import { handleGetAdminRateLimitOverridesConfig } from "./handleGetAdminRateLimitOverridesConfig";
import { handleGetAdminRateLimitRedisAllowlistConfig } from "./handleGetAdminRateLimitRedisAllowlistConfig";
import { handleGetAdminRedisV2CacheConfig } from "./handleGetAdminRedisV2CacheConfig";
import { handleGetAdminRequestBlockConfig } from "./handleGetAdminRequestBlockConfig";
import { handleGetAdminStripeSyncConfig } from "./handleGetAdminStripeSyncConfig";

import { handleGetDefaultStripeAccount } from "./handleGetDefaultStripeAccount";
import { handleGetInvoiceLineItems } from "./handleGetInvoiceLineItems";
import { handleGetMasterStripeAccount } from "./handleGetMasterStripeAccount";
import { handleGetOrgMember } from "./handleGetOrgMember";
import { handleListAdminOrgs } from "./handleListAdminOrgs";
import { handleListAdminUsers } from "./handleListAdminUsers";
import { handleListOAuthClients } from "./handleListOAuthClients";
import {
	handleCreateSlackAdminInstall,
	handleDeleteSlackAdminInstall,
	handleGetSlackAdminInstall,
	handleUpdateSlackAdminTarget,
} from "./handleSlackAdminChat";
import { handleSyncCustomerEntitlementAnchors } from "./handleSyncCustomerEntitlementAnchors";
import { handleUpsertAdminCustomerBlockConfig } from "./handleUpsertAdminCustomerBlockConfig";
import { handleUpsertAdminFeatureFlagsConfig } from "./handleUpsertAdminFeatureFlagsConfig";
import { handleUpsertAdminFullSubjectGateConfig } from "./handleUpsertAdminFullSubjectGateConfig";
import { handleUpsertAdminJobQueueConfig } from "./handleUpsertAdminJobQueueConfig";
import { handleUpsertAdminMiscellaneousEdgeConfig } from "./handleUpsertAdminMiscellaneousEdgeConfig";
import { handleUpsertAdminOrgLimitsConfig } from "./handleUpsertAdminOrgLimitsConfig";
import { handleUpsertAdminOrgRequestBlock } from "./handleUpsertAdminOrgRequestBlock";
import { handleUpsertAdminRateLimitOverridesConfig } from "./handleUpsertAdminRateLimitOverridesConfig";
import { handleUpsertAdminRateLimitRedisAllowlistConfig } from "./handleUpsertAdminRateLimitRedisAllowlistConfig";
import { handleUpsertAdminRedisV2CacheConfig } from "./handleUpsertAdminRedisV2CacheConfig";
import { handleUpsertAdminRequestBlockConfig } from "./handleUpsertAdminRequestBlockConfig";
import { handleUpsertAdminStripeSyncConfig } from "./handleUpsertAdminStripeSyncConfig";
import { handleUpsertSlackMcpOAuthClient } from "./handleUpsertSlackMcpOAuthClient";
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
honoAdminRouter.get("/orgs/:org_id/redis", ...handleGetAdminOrgRedisConfig);
honoAdminRouter.patch(
	"/orgs/:org_id/redis",
	...handleUpsertAdminOrgRedisConfig,
);
honoAdminRouter.patch(
	"/orgs/:org_id/redis/migration",
	...handleUpdateAdminOrgRedisMigration,
);
honoAdminRouter.patch(
	"/orgs/:org_id/redis/public-url",
	...handleUpdateAdminOrgRedisPublicUrl,
);
honoAdminRouter.delete(
	"/orgs/:org_id/redis",
	...handleDeleteAdminOrgRedisConfig,
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
	"/miscellaneous-edge-config",
	...handleGetAdminMiscellaneousEdgeConfig,
);
honoAdminRouter.put(
	"/miscellaneous-edge-config",
	...handleUpsertAdminMiscellaneousEdgeConfig,
);
honoAdminRouter.get(
	"/full-subject-gate-config",
	...handleGetAdminFullSubjectGateConfig,
);
honoAdminRouter.put(
	"/full-subject-gate-config",
	...handleUpsertAdminFullSubjectGateConfig,
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
honoAdminRouter.get(
	"/rate-limit-overrides-config",
	...handleGetAdminRateLimitOverridesConfig,
);
honoAdminRouter.put(
	"/rate-limit-overrides-config",
	...handleUpsertAdminRateLimitOverridesConfig,
);
honoAdminRouter.get(
	"/rate-limit-redis-allowlist-config",
	...handleGetAdminRateLimitRedisAllowlistConfig,
);
honoAdminRouter.put(
	"/rate-limit-redis-allowlist-config",
	...handleUpsertAdminRateLimitRedisAllowlistConfig,
);
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
honoAdminRouter.get("/cache-v2-ramp", ...handleGetAdminCacheV2Ramp);
honoAdminRouter.patch("/cache-v2-ramp", ...handleUpsertAdminCacheV2Ramp);
honoAdminRouter.patch(
	"/cache-v2-ramp/migration",
	...handleUpdateAdminCacheV2RampMigration,
);
honoAdminRouter.delete("/cache-v2-ramp", ...handleDeleteAdminCacheV2Ramp);
honoAdminRouter.get("/org-member", ...handleGetOrgMember);
honoAdminRouter.get("/master-stripe-account", ...handleGetMasterStripeAccount);
honoAdminRouter.get("/default-stripe-account", ...handleGetDefaultStripeAccount);
honoAdminRouter.get("/oauth-clients", ...handleListOAuthClients);
honoAdminRouter.post(
	"/oauth-clients/slack-mcp",
	...handleUpsertSlackMcpOAuthClient,
);
honoAdminRouter.get("/chat/slack-admin", ...handleGetSlackAdminInstall);
honoAdminRouter.post(
	"/chat/slack-admin/install",
	...handleCreateSlackAdminInstall,
);
honoAdminRouter.patch(
	"/chat/slack-admin/target",
	...handleUpdateSlackAdminTarget,
);
honoAdminRouter.delete("/chat/slack-admin", ...handleDeleteSlackAdminInstall);
honoAdminRouter.post("/invoice-line-items", ...handleGetInvoiceLineItems);
honoAdminRouter.post(
	"/customer-entitlements/sync-anchor",
	...handleSyncCustomerEntitlementAnchors,
);

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
