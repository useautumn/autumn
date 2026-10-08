import { ApiVersion } from "@autumn/shared";
import {
	createCustomBasePriceForProduct,
	createExternalStripeSubscription,
	expectStripeSubscriptionCreated,
	getFullProductFromMap,
	setupSharedStripeFamilies,
	waitForCustomerProducts,
} from "@tests/integration/billing/stripe-webhooks/utils/sharedStripeProductAutoSyncUtils";
import { deleteVariantTestPlans } from "@tests/integration/crud/plans/variants/utils/variantTestPlanUtils";
import { TestFeature } from "@tests/setup/v2Features";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { AutumnRpcCli } from "@/external/autumn/autumnRpcCli.js";

export const deleteLeftoverCarryPlans = async (planIds: string[]) => {
	const rpc = new AutumnRpcCli({
		secretKey: ctx.orgSecretKey,
		version: ApiVersion.V2_1,
	});
	await deleteVariantTestPlans({ rpc, planIds });
};

/** Base(consumable messages) + one variant, external sub on the base. */
export const setupConsumableFamilyOnBase = async ({
	customerId,
	baseId,
	baseIncluded,
	variantId,
	variantIncluded,
	variantAmount,
}: {
	customerId: string;
	baseId: string;
	baseIncluded: number;
	variantId: string;
	variantIncluded: number;
	variantAmount: number;
}) => {
	const {
		autumnV1,
		ctx: testCtx,
		fullProducts,
	} = await setupSharedStripeFamilies({
		customerId,
		families: [
			{
				baseId,
				group: `grp-${baseId}`,
				baseAmount: 20,
				featureId: TestFeature.Messages,
				baseIncluded,
				variants: [
					{ id: variantId, amount: variantAmount, included: variantIncluded },
				],
			},
		],
	});
	const baseFull = getFullProductFromMap({ fullProducts, productId: baseId });
	const variantFull = getFullProductFromMap({
		fullProducts,
		productId: variantId,
	});

	const basePrice = await createCustomBasePriceForProduct({
		ctx: testCtx,
		fullProduct: baseFull,
		amount: 20,
	});
	const subscription = await createExternalStripeSubscription({
		ctx: testCtx,
		customerId,
		items: [{ price: basePrice.id }],
	});
	expectStripeSubscriptionCreated({ subscription });

	await waitForCustomerProducts({
		label: "initial-sync",
		autumnV1,
		customerId,
		active: [baseId],
		notPresent: [variantId],
	});

	return { autumnV1, ctx: testCtx, baseFull, variantFull, subscription };
};
