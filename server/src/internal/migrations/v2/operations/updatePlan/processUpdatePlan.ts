import type {
	AutumnBillingPlan,
	UpdateSubscriptionBillingContext,
} from "@autumn/shared";
import type { UpdatePlanOp } from "@autumn/shared/api/migrations/operations/customer/updatePlan/index.js";
import { computeUpdateSubscriptionPlan } from "@/internal/billing/v2/actions/updateSubscription/compute/computeUpdateSubscriptionPlan.js";
import { logUpdateSubscriptionContext } from "@/internal/billing/v2/actions/updateSubscription/logs/logUpdateSubscriptionContext.js";
import { logAutumnBillingPlan } from "@/internal/billing/v2/utils/logs/logAutumnBillingPlan.js";
import { MigrationOperationError } from "../errors/index.js";
import type { OperationProcessor } from "../types/index.js";
import {
	appendMigrationBillingLog,
	filterCustomerProductsByPlanFilter,
	mergeAutumnBillingPlans,
} from "../utils/index.js";
import { stripPreparedCatalogRows } from "./applyPrepareResults/index.js";
import { setupUpdatePlanProductContext } from "./setup/index.js";

const assertNoChargeArtifacts = ({
	plan,
	customerProductId,
}: {
	plan: AutumnBillingPlan;
	customerProductId: string;
}) => {
	const lineItemCount = plan.lineItems?.length ?? 0;
	const customLineItemCount = plan.customLineItems?.length ?? 0;
	const hasRefundPlan = plan.refundPlan !== undefined;

	if (lineItemCount === 0 && customLineItemCount === 0 && !hasRefundPlan)
		return;

	throw new MigrationOperationError({
		code: "unsupported_operation_input",
		operationType: "update_plan",
		field: "customize",
		message: "Migration update_plan produced charge artifacts",
		details: {
			customerProductId,
			lineItemCount,
			customLineItemCount,
			hasRefundPlan,
		},
	});
};

export const processUpdatePlan = async ({
	ctx,
	context,
	op,
	opIndex,
	plan,
	projectedFullCustomer,
}: Parameters<OperationProcessor<UpdatePlanOp>>[0]) => {
	const { customerProducts: matchedCustomerProducts } =
		filterCustomerProductsByPlanFilter({
			customerProducts: projectedFullCustomer.customer_products,
			planFilter: op.plan_filter,
		});

	let nextPlan = plan;
	const billingContexts: UpdateSubscriptionBillingContext[] = [];
	let matchedCustomerProductCount = matchedCustomerProducts.length;

	for (const customerProduct of matchedCustomerProducts) {
		const productContext = await setupUpdatePlanProductContext({
			ctx,
			context,
			op,
			opIndex,
			projectedFullCustomer,
			customerProduct,
		});
		if (!productContext) {
			const alreadyOnRequestedVersion =
				op.version !== undefined &&
				op.customize === undefined &&
				op.version === customerProduct.product.version &&
				!customerProduct.is_custom;
			if (alreadyOnRequestedVersion) matchedCustomerProductCount -= 1;
			continue;
		}

		appendMigrationBillingLog({
			ctx,
			key: "billingContext",
			log: (logCtx) =>
				logUpdateSubscriptionContext({
					ctx: logCtx,
					billingContext: productContext.billingContext,
				}),
		});

		const computedPlan = await computeUpdateSubscriptionPlan({
			ctx,
			billingContext: productContext.billingContext,
			params: productContext.params,
		});
		appendMigrationBillingLog({
			ctx,
			key: "autumnBillingPlan",
			log: (logCtx) =>
				logAutumnBillingPlan({
					ctx: logCtx,
					plan: computedPlan,
					billingContext: productContext.billingContext,
				}),
		});

		if (op.proration !== true) {
			assertNoChargeArtifacts({
				plan: computedPlan,
				customerProductId: customerProduct.id,
			});
		}
		const executablePlan = stripPreparedCatalogRows({
			plan: computedPlan,
			preparedIds: productContext.preparedIds,
		});

		nextPlan = mergeAutumnBillingPlans({
			base: nextPlan,
			incoming: executablePlan,
		});
		billingContexts.push(productContext.billingContext);
	}

	return {
		plan: nextPlan,
		projectedFullCustomer,
		matchedCustomerProducts: matchedCustomerProductCount,
		billingContexts,
	};
};
