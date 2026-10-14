import {
	MIGRATION_WEBHOOK_EVENT_TYPES,
	type MigrationFilter,
} from "@autumn/shared";
import { isSubscribedToEvents } from "@/external/svix/subscriptions/index.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { MigrationWebhookControls } from "@/internal/migrations/v2/cloudAdapter/types.js";
import { countCustomers } from "@/internal/migrations/v2/filters/customers/filterCustomers.js";
import {
	MIGRATION_WEBHOOK_AUTO_DISABLE_THRESHOLD,
	resolveMigrationWebhookDelivery,
} from "../webhookDeliveryConstants.js";

export type MigrationWebhookRunParams = {
	sendWebhooks?: boolean;
	webhookConcurrency?: number;
};

const DELIVERY_OFF: MigrationWebhookControls = {
	sendWebhooks: false,
	webhookConcurrency: 0,
	eventTypes: [],
};

export const resolveMigrationWebhookControls = async ({
	ctx,
	filter,
	params,
	lazyRun,
	dryRun,
}: {
	ctx: AutumnContext;
	filter: MigrationFilter | null;
	params: MigrationWebhookRunParams | undefined;
	lazyRun: boolean;
	dryRun: boolean;
}): Promise<MigrationWebhookControls> => {
	if (dryRun) return DELIVERY_OFF;

	const resolved = resolveMigrationWebhookDelivery({
		sendWebhooks: params?.sendWebhooks,
		webhookConcurrency: params?.webhookConcurrency,
		matchedCustomerCount: await resolveScopeSize({
			ctx,
			filter,
			skipSizing: lazyRun || params?.sendWebhooks !== undefined,
		}),
	});
	if (!resolved.sendWebhooks) return DELIVERY_OFF;

	const eventTypes = await isSubscribedToEvents({
		org: ctx.org,
		env: ctx.env,
		eventTypes: MIGRATION_WEBHOOK_EVENT_TYPES,
	});
	if (eventTypes.length === 0) return DELIVERY_OFF;

	return { ...resolved, eventTypes };
};

const resolveScopeSize = async ({
	ctx,
	filter,
	skipSizing,
}: {
	ctx: AutumnContext;
	filter: MigrationFilter | null;
	skipSizing: boolean;
}): Promise<number> => {
	if (skipSizing) return 0;
	const customerFilter = filter?.customer;
	if (!customerFilter) return MIGRATION_WEBHOOK_AUTO_DISABLE_THRESHOLD + 1;

	return countCustomers({
		ctx,
		filter: customerFilter,
		limit: MIGRATION_WEBHOOK_AUTO_DISABLE_THRESHOLD + 1,
	});
};
