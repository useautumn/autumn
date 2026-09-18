import { isDeepStrictEqual } from "node:util";

type Request = Record<string, unknown>;

export const trialOf = (request: Request) => {
	const customize = request.customize as Request | undefined;
	return (
		customize?.free_trial !== undefined
			? customize.free_trial
			: request.free_trial
	) as Request | null | undefined;
};

export const changedRequestFields = (previous: Request, next: Request) =>
	[...new Set([...Object.keys(previous), ...Object.keys(next)])]
		.filter((field) => !isDeepStrictEqual(previous[field], next[field]))
		.map((field) => ({
			field,
			beforePresent: Object.hasOwn(previous, field),
			before: previous[field] ?? null,
			afterPresent: Object.hasOwn(next, field),
			after: next[field] ?? null,
		}));

export const assertInvoiceTrialCompatible = (request: Request) => {
	const trial = trialOf(request);
	const invoice = request.invoice_mode as Request | undefined;
	if (
		invoice?.enabled === true &&
		trial &&
		trial.card_required !== true &&
		trial.on_end !== "revert"
	)
		throw new Error(
			"Cannot use invoice mode with a no-card free trial (card_required defaults to false). Preserve existing billing terms; clarify whether the user accepts a card-required trial or a switch away from invoicing. Do not silently choose either change.",
		);
};

export const nativeBillingConfirmationGuidance =
	'For a billing compatibility clarification, request an explicit user choice. Supported confirmations are: "Switch to automatic collection."; "Switch to automatic collection and require payment before granting access."; "Finalize invoices automatically."; "Require a card for this trial and keep everything else unchanged." These exact statements authorize only their named changes, not unrelated terms. Ambiguous replies require clarification. Never claim the user chose a confirmation they did not send.';

export const assertBillingTermsPreserved = ({
	previous,
	next,
	userMessage,
	hasPaymentMethod,
}: {
	previous?: Request;
	next: Request;
	userMessage?: string;
	hasPaymentMethod: boolean;
}) => {
	const confirmation = userMessage?.trim().toLowerCase().replace(/\.$/, "");
	const automatic =
		confirmation === "switch to automatic collection" ||
		confirmation ===
			"switch to automatic collection and require payment before granting access";
	const deferAccess =
		confirmation ===
		"switch to automatic collection and require payment before granting access";
	const finalize = confirmation === "finalize invoices automatically";
	const requireCard =
		confirmation ===
		"require a card for this trial and keep everything else unchanged";
	if (previous) {
		const oldInvoice = previous.invoice_mode as Request | undefined;
		const newInvoice = next.invoice_mode as Request | undefined;
		const invoiceUnchanged = isDeepStrictEqual(oldInvoice, newInvoice);
		const authorizedAutomatic =
			automatic &&
			(newInvoice === undefined ||
				isDeepStrictEqual(newInvoice, { enabled: false }));
		const authorizedFinalize =
			finalize &&
			oldInvoice?.enabled === true &&
			isDeepStrictEqual(newInvoice, { ...oldInvoice, finalize: true });
		if (!invoiceUnchanged && !authorizedAutomatic && !authorizedFinalize)
			throw new Error(
				"Replacement changes invoice_mode without an explicit user confirmation. The prior immutable proposal remains the source of unchanged terms even after its approval is canceled. Preserve invoicing or ask a compatibility clarification.",
			);
		if (
			!isDeepStrictEqual(
				previous.enable_plan_immediately,
				next.enable_plan_immediately,
			) &&
			!(deferAccess && next.enable_plan_immediately !== true)
		)
			throw new Error(
				"Replacement changes enable_plan_immediately without an explicit user confirmation. Preserve the prior access timing or clarify the requested change.",
			);
	}
	if (
		trialOf(next)?.card_required === true &&
		(!previous || trialOf(previous)?.card_required !== true) &&
		!hasPaymentMethod &&
		!requireCard
	)
		throw new Error(
			"This trial introduces a payment-method requirement that the user has not explicitly accepted and no observed payment method satisfies. Ask a compatibility clarification rather than inventing consent.",
		);
};
