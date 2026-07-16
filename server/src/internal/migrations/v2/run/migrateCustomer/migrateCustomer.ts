import { withWaitingLock } from "@/external/redis/redisUtils.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { buildBillingLockKey } from "@/internal/billing/v2/utils/billingLock/buildBillingLockKey.js";
import { buildPreviewMigrateCustomer } from "@/internal/migrations/v2/preview/index.js";
import type { MigrationHooks } from "../../hooks/index.js";
import type { MigrationRuntime } from "../../types/migrationDefinition.js";
import { evaluateMigrateCustomerStripe } from "./evaluateMigrateCustomerStripe.js";
import { executeMigrateCustomerPlan } from "./executeMigrateCustomerPlan.js";
import {
	createMigrateCustomerRunContext,
	logMigrateCustomerResult,
} from "./logs/index.js";
import { processOperations } from "./processOperations.js";
import { setupMigrateCustomerContext } from "./setup/setupMigrateCustomerContext.js";

export type MigrateCustomerItemPreview = {
	id: string | null;
	name: string | null;
	email: string | null;
};

export type MigrateCustomerResult = {
	itemPreview: MigrateCustomerItemPreview | null;
	status: "succeeded" | "skipped";
	response: Record<string, unknown> | null;
};

const MIGRATION_CUSTOMER_LOCK_TTL_MS = 60 * 1000;
const MIGRATION_CUSTOMER_LOCK_MAX_WAIT_MS = 2 * 60 * 1000;

/** Top-level per-customer migration runner. Preview evaluates without writes. */
export const migrateCustomer = async ({
	ctx,
	customerId,
	migration,
	preview = false,
	hooks,
}: {
	ctx: AutumnContext;
	customerId: string;
	migration: MigrationRuntime;
	preview?: boolean;
	hooks?: MigrationHooks;
}): Promise<MigrateCustomerResult> => {
	const migrationCtx = createMigrateCustomerRunContext({
		ctx,
		customerId,
		migration,
		preview,
	});

	const migrate = async ({
		assertLockOwned = () => undefined,
	}: {
		assertLockOwned?: () => void;
	} = {}): Promise<MigrateCustomerResult> => {
		assertLockOwned();
		const context = await setupMigrateCustomerContext({
			ctx: migrationCtx,
			migration,
			customerId,
			preview,
		});
		assertLockOwned();

		const run = async (): Promise<MigrateCustomerResult> => {
			const {
				plan: autumnPlan,
				billingContexts,
				matchedCustomerProducts,
			} = await processOperations({
				ctx: migrationCtx,
				context,
				plan: {
					customerId:
						context.fullCustomer.id ?? context.fullCustomer.internal_id,
					insertCustomerProducts: [],
				},
			});
			assertLockOwned();

			const billingPlan = await evaluateMigrateCustomerStripe({
				ctx: migrationCtx,
				context,
				billingContexts,
				autumnBillingPlan: autumnPlan,
			});
			assertLockOwned();

			if (!preview) {
				await executeMigrateCustomerPlan({
					ctx: migrationCtx,
					context,
					billingPlan,
					billingContexts,
				});
				assertLockOwned();
			}

			const response = {
				preview: await buildPreviewMigrateCustomer({
					ctx: migrationCtx,
					originalFullCustomer: context.fullCustomer,
					autumnBillingPlan: billingPlan.autumn,
				}),
				// Invoice line items this migration would generate (empty for
				// charge-free ops) — surfaced so audit tooling can show what will
				// actually be billed, not just the feature/plan diff.
				line_items: (billingPlan.autumn.lineItems ?? []).map((item) => ({
					description: item.description,
					amount: item.amountAfterDiscounts ?? item.amount,
				})),
			};

			logMigrateCustomerResult({
				ctx: migrationCtx,
				result: {
					status: "success",
				},
			});

			return {
				itemPreview: {
					id: context.fullCustomer.id ?? null,
					name: context.fullCustomer.name ?? null,
					email: context.fullCustomer.email ?? null,
				},
				status: matchedCustomerProducts === 0 ? "skipped" : "succeeded",
				response,
			};
		};

		const baseArgs = {
			ctx: migrationCtx,
			customerId,
			context,
			preview,
		};

		return hooks?.aroundMigrateCustomer
			? hooks.aroundMigrateCustomer({ ...baseArgs, run })
			: run();
	};

	if (preview) return migrate();

	return withWaitingLock({
		lockKey: buildBillingLockKey({
			orgId: ctx.org.id,
			env: ctx.env,
			customerId,
		}),
		ttlMs: MIGRATION_CUSTOMER_LOCK_TTL_MS,
		maxWaitMs: MIGRATION_CUSTOMER_LOCK_MAX_WAIT_MS,
		errorMessage:
			"Customer billing migration already in progress, try again in a few seconds",
		fn: migrate,
	});
};
