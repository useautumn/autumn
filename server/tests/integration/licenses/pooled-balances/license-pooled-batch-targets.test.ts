import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2.js";
import { batchTransition } from "@/internal/billing/v2/actions/batchTransition/batchTransition.js";
import { invalidateCachedFullSubject } from "@/internal/customers/cache/fullSubject/index.js";
import {
	expectLicensePooledBatchStateUnchanged,
	getLicensePooledBatchState,
} from "./utils/expectLicensePooledBatchStateUnchanged.js";
import { expectLicensePooledIdentityCorrect } from "./utils/expectLicensePooledIdentityCorrect.js";
import { expectLicensePooledGrant } from "./utils/licensePooledBalanceTestUtils.js";
import {
	persistPooledBatchTransition,
	setupPooledBatchTransition,
} from "./utils/setupPooledBatchTransition.js";

test.concurrent(
	"license pooled: replaying the same mapped batch preserves usage and contributions",
	async () => {
		const {
			autumn,
			ctx,
			customerId,
			customerLicenseLinkId,
			pool,
			transition,
			executionScope,
		} = await setupPooledBatchTransition({ idPrefix: "lic-pool-batch-replay" });

		await batchTransition({ ctx, transition, executionScope });
		await invalidateCachedFullSubject({ ctx, customerId });
		await expectLicensePooledGrant({
			autumn,
			ctx,
			customerId,
			customerLicenseLinkId,
			grantPerSeat: 1000,
			seatCount: 1,
			contributionCount: 1,
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
			contributionCount: 1,
			usage: 50,
		});
		const before = await getLicensePooledBatchState({ ctx, customerId });

		await batchTransition({ ctx, transition, executionScope });

		await expectLicensePooledBatchStateUnchanged({ ctx, customerId, before });
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
);

test.concurrent(
	"license pooled: a missing mapped target rejects before changing an assigned seat",
	async () => {
		const { ctx, customerId, transition, executionScope } =
			await setupPooledBatchTransition({ idPrefix: "lic-pool-batch-missing" });
		const before = await getLicensePooledBatchState({ ctx, customerId });

		await expect(
			batchTransition({
				ctx,
				transition: { ...transition, pooledBalanceIds: {} },
				executionScope,
			}),
		).rejects.toThrow("requires a live prepared pool");

		await expectLicensePooledBatchStateUnchanged({ ctx, customerId, before });
	},
);

test.concurrent(
	"license pooled: a superseded definition rejects even when its mapped pool is live",
	async () => {
		const {
			ctx,
			customerId,
			parentPlanId,
			licensePlanId,
			pool,
			transition,
			executionScope,
		} = await setupPooledBatchTransition({ idPrefix: "lic-pool-batch-stale" });
		const successor = await persistPooledBatchTransition({
			ctx,
			params: {
				customer_id: customerId,
				plan_id: parentPlanId,
				customize: {
					upsert_licenses: [
						{
							license_plan_id: licensePlanId,
							customize: {
								add_items: [
									{ ...itemsV2.monthlyWords({ included: 2000 }), pooled: true },
								],
							},
						},
					],
				},
			},
		});
		expect(successor.incomingCustomerLicense.id).toBe(
			transition.incomingCustomerLicense.id,
		);
		expect(successor.incomingCustomerLicense.plan_license_id).not.toBe(
			transition.incomingCustomerLicense.plan_license_id,
		);
		const before = await getLicensePooledBatchState({ ctx, customerId });
		expect(before.pools).toContainEqual(
			expect.objectContaining({ id: pool.id, expires_at: null }),
		);

		await expect(
			batchTransition({ ctx, transition, executionScope }),
		).rejects.toThrow("no longer targets the current definition");

		await expectLicensePooledBatchStateUnchanged({ ctx, customerId, before });
	},
);
