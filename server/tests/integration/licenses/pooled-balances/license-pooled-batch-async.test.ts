import { expect, test } from "bun:test";
import { getPooledSourceCustomerProduct } from "@tests/integration/billing/pooled-balances/utils/getPooledBalanceDbState.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { pollUntilAsserted } from "@tests/utils/genUtils.js";
import { batchTransition } from "@/internal/billing/v2/actions/batchTransition/batchTransition.js";
import { SYNC_BATCH_TRANSITION_MAX_ENTITIES } from "@/internal/billing/v2/actions/batchTransition/utils/batchTransitionConstants.js";
import { dispatchCustomerLicenseTransitions } from "@/internal/billing/v2/execute/executeAutumnActions/executeCustomerLicenseTransitions.js";
import { countEntitiesByInternalCustomerId } from "@/internal/entities/repos/countEntitiesByInternalCustomerId.js";
import {
	expectLicensePooledBatchStateUnchanged,
	getLicensePooledBatchState,
} from "./utils/expectLicensePooledBatchStateUnchanged.js";
import { expectLicensePooledIdentityCorrect } from "./utils/expectLicensePooledIdentityCorrect.js";
import { expectLicensePooledGrant } from "./utils/licensePooledBalanceTestUtils.js";
import { setupPooledBatchTransition } from "./utils/setupPooledBatchTransition.js";
import { withLicenseAssignmentLocked } from "./utils/withLicenseAssignmentLocked.js";

test.concurrent(
	"license pooled: the async entity threshold preserves usage tracked before seat convergence",
	async () => {
		const {
			autumn,
			ctx,
			customerId,
			entityId,
			licensePlanId,
			customerLicenseLinkId,
			pool,
			transition,
			executionScope,
		} = await setupPooledBatchTransition({
			idPrefix: "lic-pool-batch-async",
			entityCount: SYNC_BATCH_TRANSITION_MAX_ENTITIES,
		});
		expect(
			await countEntitiesByInternalCustomerId({
				db: ctx.db,
				internalCustomerId:
					transition.incomingCustomerLicense.internal_customer_id,
				cap: SYNC_BATCH_TRANSITION_MAX_ENTITIES + 1,
			}),
		).toBe(SYNC_BATCH_TRANSITION_MAX_ENTITIES);
		const pending = await getLicensePooledBatchState({ ctx, customerId });
		expect(pending.assignments).toHaveLength(1);

		await withLicenseAssignmentLocked({
			ctx,
			assignmentId: pending.assignments[0].id,
			fn: async () => {
				await dispatchCustomerLicenseTransitions({
					ctx,
					customerLicenseTransitions: [transition],
				});
				await expectLicensePooledGrant({
					autumn,
					ctx,
					customerId,
					customerLicenseLinkId,
					grantPerSeat: 1000,
					seatCount: 1,
					contributionCount: 0,
				});
				await autumn.track(
					{
						customer_id: customerId,
						feature_id: TestFeature.Messages,
						value: 50,
					},
					{ timeout: 2000 },
				);
				await expectLicensePooledGrant({
					autumn,
					ctx,
					customerId,
					customerLicenseLinkId,
					grantPerSeat: 1000,
					seatCount: 1,
					contributionCount: 0,
					usage: 50,
				});
			},
		});

		await pollUntilAsserted({
			fetch: () => getLicensePooledBatchState({ ctx, customerId }),
			assert: (state) => {
				expect(state.contributions).toHaveLength(1);
				const assignedSeat = getPooledSourceCustomerProduct({
					state,
					productId: licensePlanId,
					entityId,
				});
				expect(assignedSeat.customer_entitlements).toHaveLength(2);
			},
		});
		await expectLicensePooledGrant({
			autumn,
			ctx,
			customerId,
			customerLicenseLinkId,
			grantPerSeat: 1000,
			seatCount: 1,
			contributionCount: 1,
			usage: 50,
		});
		const before = await getLicensePooledBatchState({ ctx, customerId });
		await batchTransition({ ctx, transition, executionScope });

		await expectLicensePooledBatchStateUnchanged({
			ctx,
			customerId,
			before,
		});
		await expectLicensePooledIdentityCorrect({
			ctx,
			customerId,
			customerLicenseLinkId,
			previousPool: pool,
		});
		await expectLicensePooledGrant({
			autumn,
			ctx,
			customerId,
			customerLicenseLinkId,
			grantPerSeat: 1000,
			seatCount: 1,
			contributionCount: 1,
			usage: 50,
		});
	},
	120_000,
);
