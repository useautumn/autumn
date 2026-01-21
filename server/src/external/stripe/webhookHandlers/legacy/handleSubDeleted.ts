import type Stripe from "stripe";
import { customerProductActions } from "@/internal/customers/cusProducts/actions/index.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";
import type { AutumnContext } from "../../../honoUtils/HonoEnv.js";
import {
	getFullStripeSub,
	subIsPrematurelyCanceled,
} from "../stripeSubUtils.js";
import { handleCusProductDeleted } from "./handleSubDeleted/handleCusProductDeleted.js";

export const handleSubDeleted = async ({
	ctx,
	stripeCli,
	data,
}: {
	ctx: AutumnContext;
	stripeCli: Stripe;
	data: Stripe.Subscription;
}) => {
	const { db, org, env, logger } = ctx;

	const activeCusProducts = await CusProductService.getByStripeSubId({
		db,
		stripeSubId: data.id,
		orgId: org.id,
		env,
	});

	if (activeCusProducts.length === 0) {
		if (data.livemode) {
			logger.warn(
				`subscription.deleted: ${data.id} - no customer products found`,
			);
			return;
		}
	}

	const subscription = await getFullStripeSub({
		stripeCli,
		stripeId: data.id,
	});

	const cancellationComment = subscription.cancellation_details?.comment;
	if (
		cancellationComment === "autumn_upgrade" ||
		cancellationComment === "autumn_cancel"
	) {
		logger.info(
			`sub.deleted: ${subscription.id} from ${cancellationComment}, skipping`,
		);
		return;
	}

	if (cancellationComment?.includes("trial_canceled")) {
		logger.info(
			`sub.deleted: ${subscription.id} from trial canceled, skipping`,
		);
		return;
	}

	// Prematurely canceled if cancel_at_period_end is false or cancel_at is more than 20 seconds apart from current_period_end
	const prematurelyCanceled = subIsPrematurelyCanceled(subscription);

	// const batchUpdate = [];
	for (const cusProduct of activeCusProducts) {
		await handleCusProductDeleted({
			ctx,
			db,
			stripeCli,
			cusProduct,
			subscription,
			prematurelyCanceled,
		});
	}
};
