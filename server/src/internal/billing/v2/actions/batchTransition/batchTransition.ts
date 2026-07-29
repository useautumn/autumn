import type { CustomerLicenseTransition } from "@autumn/shared";
import { withStatementTimeout } from "@/db/withStatementTimeout";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { countActiveByCustomerLicenseLinkIds } from "@/internal/licenses/repos/customerLicenseRepo/countActiveByCustomerLicenseLinkIds";
import { computeProductTransitions } from "./compute/transitions/computeProductTransitions";
import { enforceBatchTransitionAssignmentLimit } from "./errors/enforceBatchTransitionAssignmentLimit";
import {
	type BasePriceOperationResult,
	executeBasePriceOperation,
} from "./execute/executeBasePriceOperation";
import { executeCustomerEntitlementCycleOperations } from "./execute/executeCustomerEntitlementCycleOperations";
import { executeCustomerEntitlementOperations } from "./execute/executeCustomerEntitlementOperations";
import { executeCustomerProductTransition } from "./execute/executeCustomerProductTransition";
import { logBatchTransitionContext } from "./logs/logBatchTransitionContext";
import { logBatchTransitionOperations } from "./logs/logBatchTransitionOperations";
import { logBatchTransitionProductTransitions } from "./logs/logBatchTransitionProductTransitions";
import { logBatchTransitionResult } from "./logs/logBatchTransitionResult";
import { setupBatchTransitionContext } from "./setup/setupBatchTransitionContext";
import { setupCustomerEntitlementBatchTransition } from "./setup/setupCustomerEntitlementBatchTransition";
import type { BatchTransitionExecutionScope } from "./types/types";
import { BATCH_TRANSITION_STATEMENT_TIMEOUT_MS } from "./utils/batchTransitionConstants";

export const batchTransition = async ({
	ctx,
	transition,
	executionScope,
}: {
	ctx: AutumnContext;
	transition: CustomerLicenseTransition;
	executionScope: BatchTransitionExecutionScope;
}) => {
	const fromProduct = transition.outgoingCustomerLicense.planLicense?.product;
	const toProduct = transition.incomingCustomerLicense.planLicense?.product;
	if (!fromProduct || !toProduct) return;

	const productTransitions = computeProductTransitions({
		fromProduct,
		toProduct,
	});
	logBatchTransitionProductTransitions({ ctx, transition, productTransitions });

	const entitlementPriceTransitions = productTransitions.entitlementPrices;

	const hasEntitlementPriceTransitions =
		entitlementPriceTransitions.transitions.length > 0 ||
		entitlementPriceTransitions.added.length > 0 ||
		entitlementPriceTransitions.deleted.length > 0;

	const hasBatchOperations =
		hasEntitlementPriceTransitions || Boolean(productTransitions.basePrice);

	const customerProductTransition = productTransitions.customerProduct;
	if (!hasBatchOperations && !customerProductTransition) return;

	const assignmentCounts = await withStatementTimeout(
		ctx.db,
		async (transaction) =>
			countActiveByCustomerLicenseLinkIds({
				db: transaction,
				customerLicenseLinkIds: [transition.updates.linkId],
			}),
		BATCH_TRANSITION_STATEMENT_TIMEOUT_MS,
	);
	enforceBatchTransitionAssignmentLimit({
		count: assignmentCounts.get(transition.updates.linkId) ?? 0,
	});

	let entitlementResult = { replaced: 0, added: 0, removed: 0 };
	let basePriceResult: BasePriceOperationResult = {
		replaced: 0,
		added: 0,
		removed: 0,
	};
	let customerEntitlementCyclesAligned = 0;
	if (hasBatchOperations) {
		const batchTransitionContext = await setupBatchTransitionContext({
			ctx,
			customerLicense: transition.incomingCustomerLicense,
		});
		logBatchTransitionContext({ ctx, batchTransitionContext });

		const computedBatchTransition =
			await setupCustomerEntitlementBatchTransition({
				ctx,
				transition,
				batchTransitionContext,
				productTransitions,
				executionScope,
			});
		logBatchTransitionOperations({
			ctx,
			batchTransition: computedBatchTransition,
		});
		basePriceResult = await executeBasePriceOperation({
			ctx,
			batchTransition: computedBatchTransition,
			operation: computedBatchTransition.operations.basePrice,
		});
		customerEntitlementCyclesAligned =
			await executeCustomerEntitlementCycleOperations({
				ctx,
				batchTransition: computedBatchTransition,
			});

		if (hasEntitlementPriceTransitions) {
			entitlementResult = await executeCustomerEntitlementOperations({
				ctx,
				batchTransition: computedBatchTransition,
			});
		}
	}

	const customerProductsUpdated = customerProductTransition
		? await executeCustomerProductTransition({
				ctx,
				customerLicenseLinkId: transition.updates.linkId,
				transition: customerProductTransition,
			})
		: 0;
	logBatchTransitionResult({
		ctx,
		customerLicenseLinkId: transition.updates.linkId,
		result: {
			customerEntitlements: entitlementResult,
			customerEntitlementCyclesAligned,
			basePrices: basePriceResult,
			customerProductsUpdated,
		},
	});
};
