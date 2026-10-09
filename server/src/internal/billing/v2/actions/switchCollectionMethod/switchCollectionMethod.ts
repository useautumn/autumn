import type {
	BillingResponse,
	UpdateSubscriptionV1Params,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { handleSwitchCollectionMethodErrors } from "./errors/handleSwitchCollectionMethodErrors";
import { persistCollectionMethod } from "./execute/persistCollectionMethod";
import { updateStripeCollectionMethod } from "./execute/updateStripeCollectionMethod";
import { setupSwitchCollectionMethodContext } from "./setup/setupSwitchCollectionMethodContext";

/** Switches a subscription between invoicing and charging automatically, from the next renewal on. */
export const switchCollectionMethod = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: UpdateSubscriptionV1Params;
}): Promise<BillingResponse> => {
	const switchContext = await setupSwitchCollectionMethodContext({
		ctx,
		params,
	});

	handleSwitchCollectionMethodErrors({ ctx, switchContext });

	await updateStripeCollectionMethod({ ctx, switchContext });
	await persistCollectionMethod({ ctx, switchContext });

	const { fullCustomer } = switchContext;
	return {
		customer_id: fullCustomer.id ?? fullCustomer.internal_id,
		entity_id: fullCustomer.entity?.id ?? undefined,
		payment_url: null,
	};
};
