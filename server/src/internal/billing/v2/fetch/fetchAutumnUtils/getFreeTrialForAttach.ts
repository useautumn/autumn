import {
	type AttachBodyV1,
	type FreeTrial,
	type FullCustomer,
	type FullProduct,
	initFreeTrial,
	notNullish,
	planToDbFreeTrial,
} from "@autumn/shared";
import type { AutumnContext } from "@server/honoUtils/HonoEnv";
import { getFreeTrialAfterFingerprint } from "../../../../products/free-trials/freeTrialUtils";

export const getFreeTrialForAttach = async ({
	ctx,
	body,
	products,
	fullCus,
}: {
	ctx: AutumnContext;
	products: FullProduct[];
	body: AttachBodyV1;
	fullCus: FullCustomer;
}): Promise<{
	customTrial: FreeTrial | null;
	freeTrial: FreeTrial | null;
}> => {
	const { db, org } = ctx;

	// 1. Free trial either from override, or from products
	if (body.plan_override?.free_trial !== undefined) {
		const dbFreeTrial = planToDbFreeTrial({
			planFreeTrial: body.plan_override.free_trial,
		});

		const trial = dbFreeTrial
			? initFreeTrial({
					freeTrialParams: dbFreeTrial,
					internalProductId: products[0].internal_id,
					isCustom: true,
				})
			: null;

		return { customTrial: trial, freeTrial: trial };
	}

	// 2. Free trial from products
	const productWithTrial = products.find((product) =>
		notNullish(product.free_trial),
	);

	if (!productWithTrial) return { customTrial: null, freeTrial: null };

	// 3. Check if free trial has been used.
	const uniqueFreeTrial = await getFreeTrialAfterFingerprint({
		db,
		freeTrial: productWithTrial.free_trial,
		fingerprint: fullCus.fingerprint,
		internalCustomerId: fullCus.internal_id,
		multipleAllowed: org.config.multiple_trials,
		productId: productWithTrial.id,
	});

	return { customTrial: null, freeTrial: uniqueFreeTrial };
};
