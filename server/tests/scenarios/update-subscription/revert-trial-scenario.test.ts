import { test } from "bun:test";
import { formatMs, type UpdateSubscriptionV1ParamsInput } from "@autumn/shared";
import {
	setupEntityProSubscriptions,
	setupEntityRevertTrial,
	setupLicenseProSubscription,
	setupLicenseRevertTrial,
	setupPooledProSubscription,
	setupPooledRevertTrial,
} from "@tests/integration/billing/update-subscription/free-trial/utils/revertTrialScopedSetups";
import {
	expectRevertTrialReverted,
	extendRevertTrial,
	setupProSubscription,
	setupRevertTrial,
} from "@tests/integration/billing/update-subscription/free-trial/utils/revertTrialUtils";
import { TestFeature } from "@tests/setup/v2Features";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import chalk from "chalk";
import type Stripe from "stripe";

/**
 * Revert trial × billing.update QA scenarios. Each leaves a customer on Pro (paused,
 * paying on Stripe) with an Enterprise on_end: "revert" trial riding the same subscription.
 * Expect the shared Stripe subscription to stay `active` with Pro's items after every update.
 */

const logSharedSubscription = async ({
	ctx,
	label,
	subscriptionBefore,
}: {
	ctx: TestContext;
	label: string;
	subscriptionBefore: Stripe.Subscription;
}) => {
	const subscription = await ctx.stripeCli.subscriptions.retrieve(
		subscriptionBefore.id,
	);
	console.log(chalk.cyan(`[${label}] shared Stripe subscription`), {
		id: subscription.id,
		status: `${subscriptionBefore.status} → ${subscription.status}`,
		trial_end: subscription.trial_end,
		items: `${subscriptionBefore.items.data.length} → ${subscription.items.data.length}`,
	});
};

test(`${chalk.yellowBright("revert-trial: setup only — QA updates from the dashboard")}`, async () => {
	const customerId = "revert-trial-qa";
	const { trialCustomerProduct } = await setupRevertTrial({ customerId });

	console.log(chalk.green(`[${customerId}] ready`), {
		trialEndsAt: formatMs(trialCustomerProduct.trial_ends_at),
	});
});

test(`${chalk.yellowBright("revert-trial: extend trial (on_end revert) — Stripe untouched")}`, async () => {
	const customerId = "revert-trial-extend";
	const { autumnV2_3, ctx, trialCustomerProduct, subscriptionBefore } =
		await setupRevertTrial({ customerId });

	await extendRevertTrial({
		autumn: autumnV2_3,
		customerId,
		subscriptionId: trialCustomerProduct.id,
		onEnd: "revert",
	});

	await logSharedSubscription({ ctx, label: customerId, subscriptionBefore });
});

test(`${chalk.yellowBright("revert-trial: extend trial without on_end (dashboard shape) — inherits revert")}`, async () => {
	const customerId = "revert-trial-extend-inherit";
	const { autumnV2_3, ctx, trialCustomerProduct, subscriptionBefore } =
		await setupRevertTrial({ customerId });

	await extendRevertTrial({
		autumn: autumnV2_3,
		customerId,
		subscriptionId: trialCustomerProduct.id,
	});

	await logSharedSubscription({ ctx, label: customerId, subscriptionBefore });
});

test(`${chalk.yellowBright("revert-trial: change prepaid quantity — trial kept, Stripe untouched")}`, async () => {
	const customerId = "revert-trial-quantity";
	const { autumnV2_3, ctx, trialCustomerProduct, subscriptionBefore } =
		await setupRevertTrial({ customerId });

	await autumnV2_3.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
		customer_id: customerId,
		subscription_id: trialCustomerProduct.id,
		feature_quantities: [{ feature_id: TestFeature.Messages, quantity: 300 }],
	});

	await logSharedSubscription({ ctx, label: customerId, subscriptionBefore });
});

test(`${chalk.yellowBright("revert-trial: extend then cancel immediately — Pro restored")}`, async () => {
	const customerId = "revert-trial-cancel";
	const {
		autumnV2_3,
		ctx,
		pro,
		enterprise,
		trialCustomerProduct,
		subscriptionBefore,
	} = await setupRevertTrial({ customerId });

	await extendRevertTrial({
		autumn: autumnV2_3,
		customerId,
		subscriptionId: trialCustomerProduct.id,
		onEnd: "revert",
	});
	await autumnV2_3.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
		customer_id: customerId,
		plan_id: enterprise.id,
		cancel_action: "cancel_immediately",
	});

	await expectRevertTrialReverted({
		ctx,
		customerId,
		trialProductId: enterprise.id,
		pausedProductId: pro.id,
	});
	await logSharedSubscription({ ctx, label: customerId, subscriptionBefore });
});

test(`${chalk.yellowBright("revert-trial: convert to bill / remove trial — both rejected")}`, async () => {
	const customerId = "revert-trial-rejected";
	const { autumnV2_3, ctx, trialCustomerProduct, subscriptionBefore } =
		await setupRevertTrial({ customerId });

	const rejectedUpdates = {
		convertToBill: () =>
			extendRevertTrial({
				autumn: autumnV2_3,
				customerId,
				subscriptionId: trialCustomerProduct.id,
				onEnd: "bill",
			}),
		removeTrial: () =>
			autumnV2_3.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
				customer_id: customerId,
				subscription_id: trialCustomerProduct.id,
				customize: { free_trial: null },
			}),
	};

	for (const [name, update] of Object.entries(rejectedUpdates)) {
		const message = await update().then(
			() => "ACCEPTED (unexpected)",
			(error: Error) => error.message,
		);
		console.log(chalk.magenta(`[${customerId}] ${name}`), message);
	}

	await logSharedSubscription({ ctx, label: customerId, subscriptionBefore });
});

const scopedSetups = {
	"revert-trial-entities": setupEntityRevertTrial,
	"revert-trial-pooled": setupPooledRevertTrial,
	"revert-trial-licenses": setupLicenseRevertTrial,
};

for (const [customerId, setup] of Object.entries(scopedSetups)) {
	test(`${chalk.yellowBright(`revert-trial: ${customerId} — extend trial, Stripe untouched`)}`, async () => {
		const {
			autumnV2_3,
			ctx,
			entityId,
			trialCustomerProduct,
			subscriptionBefore,
		} = await setup({ customerId });

		await extendRevertTrial({
			autumn: autumnV2_3,
			customerId,
			subscriptionId: trialCustomerProduct.id,
			entityId,
		});

		await logSharedSubscription({
			ctx,
			label: customerId,
			subscriptionBefore,
		});
	});
}

const activeSubscriptionSetups = {
	"revert-trial-e2e": setupProSubscription,
	"revert-trial-e2e-entities": setupEntityProSubscriptions,
	"revert-trial-e2e-pooled": setupPooledProSubscription,
	"revert-trial-e2e-licenses": setupLicenseProSubscription,
};

for (const [customerId, setup] of Object.entries(activeSubscriptionSetups)) {
	test(`${chalk.yellowBright(`revert-trial e2e: ${customerId} — active Pro sub, attach the revert trial yourself`)}`, async () => {
		const { pro, enterprise, entityId } = await setup({ customerId });

		console.log(chalk.green(`[${customerId}] ready`), {
			activePlan: pro.id,
			revertTrialPlan: enterprise.id,
			entityId,
		});
	});
}
