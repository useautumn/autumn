import type { Migration } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { buildPreviewMigrateCustomer } from "@/internal/migrations/v2/preview/index.js";
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

/**
 * Top-level per-customer migration runner.
 *
 *   1. Customer-level setup once (FullCustomer + migration facts).
 *   2. Fold ordered operations onto one AutumnBillingPlan.
 *   3. Evaluate/execute the plan.
 *
 * `preview: true` short-circuits after evaluate — no DB or Stripe writes.
 */
export const migrateCustomer = async ({
	ctx,
	customerId,
	migration,
	preview = false,
}: {
	ctx: AutumnContext;
	customerId: string;
	migration: Migration;
	preview?: boolean;
}): Promise<MigrateCustomerResult> => {
	const migrationCtx = createMigrateCustomerRunContext({
		ctx,
		customerId,
		migration,
		preview,
	});

	const context = await setupMigrateCustomerContext({
		ctx: migrationCtx,
		migration,
		customerId,
	});

	const {
		plan: autumnPlan,
		billingContexts,
		matchedCustomerProducts,
	} = await processOperations({
		ctx: migrationCtx,
		context,
		plan: {
			customerId: context.fullCustomer.id ?? context.fullCustomer.internal_id,
			insertCustomerProducts: [],
		},
	});

	const billingPlan = await evaluateMigrateCustomerStripe({
		ctx: migrationCtx,
		context,
		billingContexts,
		autumnBillingPlan: autumnPlan,
	});

	if (!preview) {
		await executeMigrateCustomerPlan({
			ctx: migrationCtx,
			context,
			billingPlan,
		});
	}

	const response = {
		preview: await buildPreviewMigrateCustomer({
			ctx: migrationCtx,
			originalFullCustomer: context.fullCustomer,
			autumnBillingPlan: billingPlan.autumn,
		}),
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
