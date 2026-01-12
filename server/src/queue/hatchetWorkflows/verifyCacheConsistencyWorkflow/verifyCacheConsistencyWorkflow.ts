import { type ApiCustomer, type AppEnv, CusExpand } from "@autumn/shared";
import * as Sentry from "@sentry/bun";
import { db } from "@/db/initDrizzle.js";
import { hatchet } from "@/external/hatchet/initHatchet.js";
import { getSentryTags } from "@/external/sentry/sentryUtils.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusService } from "@/internal/customers/CusService.js";
import { getApiCustomerBase } from "@/internal/customers/cusUtils/apiCusUtils/getApiCustomerBase.js";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer.js";
import { getCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/getCachedFullCustomer.js";
import { JobName } from "../../JobName.js";
import { createWorkflowTask } from "../createWorkflowTask.js";
import { checkForMisingBalance } from "./checkForMisingBalance.js";

export type VerifyCacheInput = {
	customerId: string;
	orgId: string;
	env: AppEnv;
	source: string;
	newCustomerProductId: string;
	previousFullCustomer: string;
};

type VerifyCacheOutput = {
	verify: {
		consistent: boolean;
		customerId: string;
		source: string;
	};
};

// Only create workflow if Hatchet is enabled
export const verifyCacheConsistencyWorkflow = hatchet?.workflow<
	VerifyCacheInput,
	VerifyCacheOutput
>({
	name: JobName.VerifyCacheConsistency,
});

// Check if subscriptions match
const checkSubscriptionsMatch = ({
	ctx,
	dbCustomer,
	cachedCustomer,
}: {
	ctx: AutumnContext;
	dbCustomer: ApiCustomer;
	cachedCustomer: ApiCustomer;
}): { success: boolean; message: string } => {
	for (const subscription of dbCustomer.subscriptions) {
		const cachedSubscription = cachedCustomer.subscriptions.find(
			(s) => s.plan_id === subscription.plan_id,
		);
		if (!cachedSubscription) {
			return {
				success: false,
				message: `Subscription ${subscription.plan_id} not found in cached customer`,
			};
		}
	}

	for (const scheduledSubscription of dbCustomer.scheduled_subscriptions) {
		const cachedScheduledSubscription =
			cachedCustomer.scheduled_subscriptions.find(
				(s) => s.plan_id === scheduledSubscription.plan_id,
			);
		if (!cachedScheduledSubscription) {
			return {
				success: false,
				message: `Scheduled subscription ${scheduledSubscription.plan_id} not found in cached customer`,
			};
		}
	}

	return {
		success: true,
		message: "Subscriptions match",
	};
};

verifyCacheConsistencyWorkflow?.task({
	name: JobName.VerifyCacheConsistency,
	executionTimeout: "60s",
	fn: createWorkflowTask<VerifyCacheInput, VerifyCacheOutput["verify"]>({
		handler: async ({ input, autumnContext }) => {
			const { customerId, source } = input;

			// Get from cache (now using full customer cache)
			const cachedFullCustomer = await getCachedFullCustomer({
				orgId: autumnContext.org.id,
				env: autumnContext.env,
				customerId,
			});

			if (!cachedFullCustomer) {
				autumnContext.logger.info(
					`[verifyCacheConsistency] No cached customer found for ${customerId}`,
				);
				return {
					consistent: true,
					customerId,
					source,
				};
			}

			// Get fresh from DB
			const fullCus = await CusService.getFull({
				db,
				idOrInternalId: customerId,
				orgId: autumnContext.org.id,
				env: autumnContext.env,
				withEntities: true,
				withSubs: true,
				expand: [CusExpand.Invoices],
			});

			const { apiCustomer: dbCustomer } = await getApiCustomerBase({
				ctx: autumnContext,
				fullCus,
				withAutumnId: true,
			});

			// Convert cached full customer to API customer for comparison
			const { apiCustomer: cachedCustomer } = await getApiCustomerBase({
				ctx: autumnContext,
				fullCus: cachedFullCustomer,
				withAutumnId: true,
			});

			autumnContext.logger.info(`DB CUSTOMER`, { data: dbCustomer });
			autumnContext.logger.info(`CACHED CUSTOMER`, { data: cachedCustomer });

			const {
				success: subscriptionsMatch,
				message: subscriptionsMatchMessage,
			} = checkSubscriptionsMatch({
				ctx: autumnContext,
				dbCustomer,
				cachedCustomer,
			});

			if (!subscriptionsMatch) {
				autumnContext.logger.info(
					`[verifyCacheConsistency] subscriptions mismatch for customer ${customerId}`,
				);

				await deleteCachedFullCustomer({
					customerId,
					ctx: autumnContext,
					source: "verifyCacheConsistency",
				});

				Sentry.captureException(new Error(subscriptionsMatchMessage), {
					tags: getSentryTags({
						ctx: autumnContext,
						customerId,
						alert: true,
					}),
				});
			}

			await checkForMisingBalance({
				ctx: autumnContext,
				payload: input,
				fullCustomer: fullCus,
			});

			return {
				consistent: subscriptionsMatch,
				customerId,
				source,
			};
		},
	}),
});
