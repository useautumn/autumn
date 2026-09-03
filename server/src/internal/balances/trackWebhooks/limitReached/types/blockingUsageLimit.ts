import type { UsageLimitFilter, UsageLimitWebhookBlock } from "@autumn/shared";

export type BlockingUsageLimit = {
	block: UsageLimitWebhookBlock;
	filter: UsageLimitFilter | undefined;
};
