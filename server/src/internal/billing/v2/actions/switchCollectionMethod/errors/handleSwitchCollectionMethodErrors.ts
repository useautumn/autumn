import {
	CollectionMethod,
	ErrCode,
	orgDisableStripeWrites,
	RecaseError,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { SwitchCollectionMethodContext } from "../setup/setupSwitchCollectionMethodContext";

const invalidRequest = (message: string) =>
	new RecaseError({
		message,
		code: ErrCode.InvalidRequest,
		statusCode: StatusCodes.BAD_REQUEST,
	});

const scheduleHasPinnedCollectionMethod = (
	stripeSubscription?: Stripe.Subscription,
) => {
	const schedule = stripeSubscription?.schedule;
	if (!schedule || typeof schedule === "string") return false;
	return schedule.phases.some((phase) => Boolean(phase.collection_method));
};

export const handleSwitchCollectionMethodErrors = ({
	ctx,
	switchContext,
}: {
	ctx: AutumnContext;
	switchContext: SwitchCollectionMethodContext;
}) => {
	const {
		fullCustomer,
		targetCollectionMethod,
		invoiceMode,
		paymentMethod,
		stripeSubscription,
		requestedInvoiceTerms,
	} = switchContext;

	if (orgDisableStripeWrites({ ctx })) {
		throw invalidRequest(
			"Stripe writes are disabled for this organization, so the subscription's collection method can't be switched.",
		);
	}

	// Without a Stripe subscription there's nowhere to keep net terms or payment methods.
	if (!stripeSubscription && invoiceMode && requestedInvoiceTerms) {
		throw invalidRequest(
			"This plan has no Stripe subscription yet, so net_terms_days and payment_method_types can't be saved. Switch without them.",
		);
	}

	if (fullCustomer.processors?.vercel?.installation_id) {
		throw invalidRequest(
			"This customer is billed outside of Stripe, please use the origin platform to manage their billing.",
		);
	}

	// Stripe accepts the switch without a card, then fails the next renewal.
	if (
		targetCollectionMethod === CollectionMethod.ChargeAutomatically &&
		(!paymentMethod || paymentMethod.type === "custom")
	) {
		throw invalidRequest(
			`Customer ${fullCustomer.id ?? fullCustomer.internal_id} has no payment method on file, so the subscription can't be charged automatically. Collect a payment method first.`,
		);
	}

	// A phase that pins collection_method would silently revert the switch at its start.
	if (scheduleHasPinnedCollectionMethod(stripeSubscription)) {
		throw invalidRequest(
			"This subscription's schedule sets a collection method on its phases, so the switch would be reverted. Update the schedule in Stripe instead.",
		);
	}
};
