import { CusProductStatus } from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { matchesTarget } from "@/internal/billing/v2/execute/pendingCustomerProducts/findPendingCustomerProduct";
import { LONG_LIVED_CHECKOUT_STRIPE_METADATA_KEY } from "@/internal/billing/v2/providers/stripe/execute/executeStripeCheckoutSessionAction";
import { CusService } from "@/internal/customers/CusService";
import { MetadataService } from "@/internal/metadata/MetadataService";

/** A plan a long-lived link granted with enable_plan_immediately, before it is paid.
 * Its payment metadata lives on the Stripe session, so it's carried like a pending row's. */
export const findUnpaidLongLivedCustomerProduct = async ({
	ctx,
	customerId,
	productId,
	entityId,
	customerProductId,
	subscriptionId,
}: {
	ctx: AutumnContext;
	customerId: string;
	productId?: string;
	entityId?: string;
	customerProductId?: string;
	subscriptionId?: string;
}) => {
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
		inStatuses: [CusProductStatus.Active],
		withEntities: false,
		entityId,
	});

	const customerProduct = fullCustomer.customer_products.find(
		(candidate) =>
			Boolean(candidate.stripe_checkout_session_id) &&
			!candidate.subscription_ids?.length &&
			matchesTarget({
				customerProduct: candidate,
				productId,
				entityId,
				customerProductId,
				subscriptionId,
			}),
	);
	if (!customerProduct?.stripe_checkout_session_id) return;

	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
	const session = await stripeCli.checkout.sessions.retrieve(
		customerProduct.stripe_checkout_session_id,
	);
	if (session.status === "complete") return;
	if (!session.metadata?.[LONG_LIVED_CHECKOUT_STRIPE_METADATA_KEY]) return;

	const metadataId = session.metadata.autumn_metadata_id;
	if (!metadataId) return;
	if (!(await MetadataService.get({ db: ctx.db, id: metadataId }))) return;

	return { ...customerProduct, metadata_id: metadataId };
};
