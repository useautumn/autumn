import {
	AppEnv,
	atmnToStripeAmount,
	CustomerNotFoundError,
	ErrCode,
	RecaseError,
	type RefundableChargeRow,
	type RefundMode,
	type RefundReason,
	type RefundSourceType,
	stripeToAtmnAmount,
} from "@autumn/shared";
import type Stripe from "stripe";
import { orgToAccountId } from "@/external/connect/connectUtils.js";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusService } from "../CusService.js";

const STRIPE_CHARGE_LIST_PAGE_LIMIT = 100;

type StripeChargeWithInvoice = Stripe.Charge & {
	invoice?: string | Stripe.Invoice | null;
};

type StripeInvoiceWithSubscription = Stripe.Invoice & {
	subscription?: string | Stripe.Subscription | null;
};

type StripePaymentIntentWithInvoice = Stripe.PaymentIntent & {
	invoice?: string | Stripe.Invoice | null;
};

type ChargeMetadata = {
	invoice?: StripeInvoiceWithSubscription | null;
	paymentIntent?: StripePaymentIntentWithInvoice | null;
	checkoutSession?: Stripe.Checkout.Session | null;
};

type RefundPreviewItem = RefundableChargeRow & {
	refundAmount: number;
};

type RefundExecutionResult = {
	chargeId: string;
	refundId: string | null;
	currency: string;
	amount: number;
	status: "succeeded" | "failed";
	errorMessage: string | null;
};

const getStripeDashboardBaseUrl = ({
	env,
	accountId,
}: {
	env: AppEnv;
	accountId?: string;
}) => {
	const accountPath = accountId ? `/${accountId}` : "";
	const testPath = env === AppEnv.Live ? "" : "/test";
	return `https://dashboard.stripe.com${accountPath}${testPath}`;
};

const getStripeChargeUrl = ({
	ctx,
	chargeId,
}: {
	ctx: AutumnContext;
	chargeId: string;
}) => {
	const baseUrl = getStripeDashboardBaseUrl({
		env: ctx.env,
		accountId: orgToAccountId({ org: ctx.org, env: ctx.env }),
	});
	return `${baseUrl}/payments/${chargeId}`;
};

const getChargeInvoice = ({ charge }: { charge: Stripe.Charge }) => {
	const chargeWithInvoice = charge as StripeChargeWithInvoice;
	return chargeWithInvoice.invoice;
};

const getPaymentIntentInvoice = ({
	paymentIntent,
}: {
	paymentIntent?: Stripe.PaymentIntent | null;
}) => {
	if (!paymentIntent) return null;
	return (paymentIntent as StripePaymentIntentWithInvoice).invoice ?? null;
};

const getInvoiceSubscription = ({
	invoice,
}: {
	invoice?: Stripe.Invoice | null;
}) => {
	if (!invoice) return null;
	return (invoice as StripeInvoiceWithSubscription).subscription ?? null;
};

const getSourceType = ({
	charge,
	metadata,
}: {
	charge: Stripe.Charge;
	metadata: ChargeMetadata;
}): RefundSourceType => {
	const chargeInvoice = getChargeInvoice({ charge });
	const paymentIntentInvoice = getPaymentIntentInvoice({
		paymentIntent: metadata.paymentIntent,
	});

	if (
		metadata.invoice?.id ||
		typeof chargeInvoice === "string" ||
		typeof paymentIntentInvoice === "string" ||
		typeof metadata.checkoutSession?.invoice === "string"
	) {
		return "invoice";
	}
	if (metadata.checkoutSession?.id) {
		return "checkout_session";
	}
	if (
		getInvoiceSubscription({ invoice: metadata.invoice }) ||
		typeof metadata.checkoutSession?.subscription === "string"
	) {
		return "subscription";
	}
	if (metadata.paymentIntent?.id || typeof charge.payment_intent === "string") {
		return "payment_intent";
	}
	return "direct_charge";
};

const getSourceLabel = ({
	charge,
	metadata,
	sourceType,
}: {
	charge: Stripe.Charge;
	metadata: ChargeMetadata;
	sourceType: RefundSourceType;
}) => {
	const chargeInvoice = getChargeInvoice({ charge });
	const paymentIntentInvoice = getPaymentIntentInvoice({
		paymentIntent: metadata.paymentIntent,
	});
	const invoiceId =
		metadata.invoice?.id ||
		(typeof chargeInvoice === "string" ? chargeInvoice : null) ||
		(typeof paymentIntentInvoice === "string" ? paymentIntentInvoice : null) ||
		(typeof metadata.checkoutSession?.invoice === "string"
			? metadata.checkoutSession.invoice
			: null);
	const paymentIntentId =
		metadata.paymentIntent?.id ||
		(typeof charge.payment_intent === "string" ? charge.payment_intent : null);
	const checkoutSessionId = metadata.checkoutSession?.id ?? null;
	const invoiceSubscription = getInvoiceSubscription({
		invoice: metadata.invoice,
	});
	const subscriptionId =
		(typeof invoiceSubscription === "string" ? invoiceSubscription : null) ||
		(typeof metadata.checkoutSession?.subscription === "string"
			? metadata.checkoutSession.subscription
			: null);

	if (sourceType === "invoice" && invoiceId) {
		return `Invoice ${invoiceId}`;
	}
	if (sourceType === "checkout_session" && checkoutSessionId) {
		return `Checkout session ${checkoutSessionId}`;
	}
	if (sourceType === "subscription" && subscriptionId) {
		return `Subscription ${subscriptionId}`;
	}
	if (sourceType === "payment_intent" && paymentIntentId) {
		return `Payment intent ${paymentIntentId}`;
	}
	return charge.description || charge.id;
};

const getProductNames = ({ metadata }: { metadata: ChargeMetadata }) => {
	const invoiceLines = metadata.invoice?.lines?.data ?? [];
	const productNames = invoiceLines
		.map((line: Stripe.InvoiceLineItem) => {
			if (typeof line.description === "string" && line.description.trim()) {
				return line.description.trim();
			}
			return null;
		})
		.filter((name: string | null): name is string => Boolean(name));

	return [...new Set(productNames)];
};

const isRefundableCharge = ({ charge }: { charge: Stripe.Charge }) => {
	return (
		charge.paid &&
		charge.status === "succeeded" &&
		charge.amount - charge.amount_refunded > 0
	);
};

const getCheckoutSessionForPaymentIntent = async ({
	stripeCli,
	paymentIntentId,
}: {
	stripeCli: Stripe;
	paymentIntentId?: string | null;
}) => {
	if (!paymentIntentId) return null;

	try {
		const sessions = await stripeCli.checkout.sessions.list({
			payment_intent: paymentIntentId,
			limit: 1,
		});
		return sessions.data[0] ?? null;
	} catch {
		return null;
	}
};

const getChargeMetadata = async ({
	stripeCli,
	charge,
}: {
	stripeCli: Stripe;
	charge: Stripe.Charge;
}): Promise<ChargeMetadata> => {
	const chargeInvoice = getChargeInvoice({ charge });
	const invoiceId =
		typeof chargeInvoice === "string" ? chargeInvoice : chargeInvoice?.id;
	const paymentIntentId =
		typeof charge.payment_intent === "string"
			? charge.payment_intent
			: charge.payment_intent?.id;

	const [invoice, paymentIntent, checkoutSession] = await Promise.all([
		invoiceId
			? stripeCli.invoices.retrieve(invoiceId, {
					expand: ["subscription", "lines.data.price.product"],
				})
			: Promise.resolve(null),
		paymentIntentId
			? stripeCli.paymentIntents.retrieve(paymentIntentId, {
					expand: ["invoice"],
				})
			: Promise.resolve(null),
		getCheckoutSessionForPaymentIntent({ stripeCli, paymentIntentId }),
	]);

	return {
		invoice: invoice as StripeInvoiceWithSubscription | null,
		paymentIntent: paymentIntent as StripePaymentIntentWithInvoice | null,
		checkoutSession,
	};
};

const chargeToRefundableRow = async ({
	ctx,
	stripeCli,
	charge,
}: {
	ctx: AutumnContext;
	stripeCli: Stripe;
	charge: Stripe.Charge;
}): Promise<RefundableChargeRow | null> => {
	if (!isRefundableCharge({ charge })) return null;

	const refundableAmountMinor = charge.amount - charge.amount_refunded;
	const metadata = await getChargeMetadata({ stripeCli, charge });
	const sourceType = getSourceType({ charge, metadata });
	const chargeInvoice = getChargeInvoice({ charge });
	const paymentIntentInvoice = getPaymentIntentInvoice({
		paymentIntent: metadata.paymentIntent,
	});
	const paymentIntentId =
		typeof charge.payment_intent === "string"
			? charge.payment_intent
			: (charge.payment_intent?.id ?? metadata.paymentIntent?.id ?? null);
	const invoiceId =
		(typeof chargeInvoice === "string" ? chargeInvoice : null) ||
		metadata.invoice?.id ||
		(typeof paymentIntentInvoice === "string" ? paymentIntentInvoice : null) ||
		(typeof metadata.checkoutSession?.invoice === "string"
			? metadata.checkoutSession.invoice
			: null);
	const checkoutSessionId = metadata.checkoutSession?.id ?? null;
	const invoiceSubscription = getInvoiceSubscription({
		invoice: metadata.invoice,
	});
	const subscriptionId =
		(typeof invoiceSubscription === "string" ? invoiceSubscription : null) ||
		(typeof metadata.checkoutSession?.subscription === "string"
			? metadata.checkoutSession.subscription
			: null);

	return {
		id: charge.id,
		chargeId: charge.id,
		createdAt: charge.created * 1000,
		currency: charge.currency,
		amountPaid: stripeToAtmnAmount({
			amount: charge.amount,
			currency: charge.currency,
		}),
		refundedAmount: stripeToAtmnAmount({
			amount: charge.amount_refunded,
			currency: charge.currency,
		}),
		refundableAmount: stripeToAtmnAmount({
			amount: refundableAmountMinor,
			currency: charge.currency,
		}),
		sourceType,
		sourceLabel: getSourceLabel({ charge, metadata, sourceType }),
		paymentIntentId,
		invoiceId,
		checkoutSessionId,
		subscriptionId,
		productNames: getProductNames({ metadata }),
		description: charge.description,
		stripeUrl: getStripeChargeUrl({ ctx, chargeId: charge.id }),
	};
};

const sortRows = ({ rows }: { rows: RefundableChargeRow[] }) => {
	return rows.sort((a, b) => b.createdAt - a.createdAt);
};

export const getRefundCustomer = async ({
	ctx,
	customerId,
}: {
	ctx: AutumnContext;
	customerId: string;
}) => {
	const customer = await CusService.get({
		db: ctx.db,
		idOrInternalId: customerId,
		orgId: ctx.org.id,
		env: ctx.env,
	});

	if (!customer) {
		throw new CustomerNotFoundError({ customerId });
	}

	if (customer.processor?.type !== "stripe" || !customer.processor?.id) {
		throw new RecaseError({
			message: "Refunds are only available for Stripe-backed customers",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	return customer;
};

const getRefundableChargeRowsForChargeIds = async ({
	ctx,
	customerId,
	chargeIds,
}: {
	ctx: AutumnContext;
	customerId: string;
	chargeIds: string[];
}) => {
	const customer = await getRefundCustomer({ ctx, customerId });
	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
	const uniqueChargeIds = [...new Set(chargeIds)];
	const rows = await Promise.all(
		uniqueChargeIds.map(async (chargeId) => {
			const charge = await stripeCli.charges.retrieve(chargeId);
			if (charge.customer !== customer.processor.id) {
				throw new RecaseError({
					message: `Charge ${chargeId} does not belong to this customer`,
					code: ErrCode.InvalidRequest,
					statusCode: 400,
				});
			}
			const row = await chargeToRefundableRow({ ctx, stripeCli, charge });
			if (!row) {
				throw new RecaseError({
					message: `Charge ${chargeId} is not refundable or no longer belongs to this customer`,
					code: ErrCode.InvalidRequest,
					statusCode: 400,
				});
			}
			return row;
		}),
	);

	return sortRows({ rows });
};

export const listRefundableCharges = async ({
	ctx,
	customerId,
	startingAfter,
	maxRefundableRows,
}: {
	ctx: AutumnContext;
	customerId: string;
	startingAfter?: string;
	maxRefundableRows?: number;
}) => {
	const customer = await getRefundCustomer({ ctx, customerId });
	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
	const rows: RefundableChargeRow[] = [];
	let chargeCursor = startingAfter;
	let hasMoreCharges = true;
	const targetCount = maxRefundableRows ?? Number.POSITIVE_INFINITY;

	while (hasMoreCharges && rows.length < targetCount) {
		const page = await stripeCli.charges.list({
			customer: customer.processor.id,
			limit: STRIPE_CHARGE_LIST_PAGE_LIMIT,
			starting_after: chargeCursor,
		});

		for (const charge of page.data) {
			chargeCursor = charge.id;
			if (!isRefundableCharge({ charge })) continue;
			const row = await chargeToRefundableRow({ ctx, stripeCli, charge });
			if (!row) continue;
			rows.push(row);
			if (rows.length >= targetCount) break;
		}

		hasMoreCharges = page.has_more;
	}

	return {
		rows: sortRows({ rows }),
		hasMoreCharges,
		nextStartingAfter: chargeCursor,
	};
};

export const getRefundableChargesPage = async ({
	ctx,
	customerId,
	offset,
	limit,
}: {
	ctx: AutumnContext;
	customerId: string;
	offset: number;
	limit: number;
}) => {
	const { rows, hasMoreCharges } = await listRefundableCharges({
		ctx,
		customerId,
		maxRefundableRows: offset + limit + 1,
	});
	const list = rows.slice(offset, offset + limit);
	const hasMore = rows.length > offset + limit || hasMoreCharges;
	const total = hasMore ? offset + list.length + 1 : offset + list.length;

	return {
		list,
		has_more: hasMore,
		offset,
		limit,
		total,
	};
};

const validateSharedCurrency = ({ rows }: { rows: RefundableChargeRow[] }) => {
	const currencies = [...new Set(rows.map((row) => row.currency))];
	if (currencies.length > 1) {
		throw new RecaseError({
			message: "Selected charges must all use the same currency",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
	return currencies[0];
};

const validateRefundAmount = ({
	row,
	amount,
}: {
	row: RefundableChargeRow;
	amount: number;
}) => {
	if (!Number.isFinite(amount)) {
		throw new RecaseError({
			message: `Refund amount for ${row.chargeId} must be numeric`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
	if (amount < 0) {
		throw new RecaseError({
			message: `Refund amount for ${row.chargeId} must be at least 0`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
	if (amount > row.refundableAmount) {
		throw new RecaseError({
			message: `Refund amount for ${row.chargeId} exceeds the refundable balance`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
	return amount;
};

export const buildRefundPreview = async ({
	ctx,
	customerId,
	chargeIds,
	mode,
	amountsByChargeId,
	reason,
}: {
	ctx: AutumnContext;
	customerId: string;
	chargeIds: string[];
	mode: RefundMode;
	amountsByChargeId?: Record<string, number>;
	reason?: RefundReason;
}) => {
	if (chargeIds.length === 0) {
		throw new RecaseError({
			message: "Select at least one charge to refund",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	const selectedRows = await getRefundableChargeRowsForChargeIds({
		ctx,
		customerId,
		chargeIds,
	});
	const currency = validateSharedCurrency({ rows: selectedRows });
	const charges: RefundPreviewItem[] = selectedRows.map((row) => {
		const amount =
			mode === "full"
				? row.refundableAmount
				: validateRefundAmount({
						row,
						amount: amountsByChargeId?.[row.chargeId] ?? 0,
					});
		return {
			...row,
			refundAmount: amount,
		};
	});

	const refundCount = charges.filter(
		(charge) => charge.refundAmount > 0,
	).length;
	if (refundCount === 0) {
		throw new RecaseError({
			message:
				"At least one selected charge must have a refund amount greater than 0",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	return {
		charges,
		summary: {
			currency,
			chargeCount: charges.length,
			refundCount,
			totalPaidAmount: charges.reduce(
				(sum, charge) => sum + charge.amountPaid,
				0,
			),
			totalRefundedAmount: charges.reduce(
				(sum, charge) => sum + charge.refundedAmount,
				0,
			),
			totalRefundableAmount: charges.reduce(
				(sum, charge) => sum + charge.refundableAmount,
				0,
			),
			totalRefundAmount: charges.reduce(
				(sum, charge) => sum + charge.refundAmount,
				0,
			),
		},
		mode,
		reason: reason ?? null,
	};
};

export const executeRefunds = async ({
	ctx,
	customerId,
	chargeIds,
	mode,
	amountsByChargeId,
	reason,
}: {
	ctx: AutumnContext;
	customerId: string;
	chargeIds: string[];
	mode: RefundMode;
	amountsByChargeId?: Record<string, number>;
	reason?: RefundReason;
}) => {
	await getRefundCustomer({ ctx, customerId });
	const preview = await buildRefundPreview({
		ctx,
		customerId,
		chargeIds,
		mode,
		amountsByChargeId,
		reason,
	});
	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });

	const refunds: RefundExecutionResult[] = [];

	for (const charge of preview.charges) {
		if (charge.refundAmount <= 0) continue;

		try {
			const stripeRefund = await stripeCli.refunds.create({
				charge: charge.chargeId,
				amount: atmnToStripeAmount({
					amount: charge.refundAmount,
					currency: charge.currency,
				}),
				reason: reason ?? undefined,
			});
			refunds.push({
				chargeId: charge.chargeId,
				refundId: stripeRefund.id,
				currency: stripeRefund.currency,
				amount: stripeToAtmnAmount({
					amount: stripeRefund.amount,
					currency: stripeRefund.currency,
				}),
				status: "succeeded",
				errorMessage: null,
			});
		} catch (error) {
			refunds.push({
				chargeId: charge.chargeId,
				refundId: null,
				currency: charge.currency,
				amount: charge.refundAmount,
				status: "failed",
				errorMessage:
					error instanceof Error
						? error.message
						: "Failed to create Stripe refund",
			});
		}
	}

	return {
		...preview,
		refunds,
	};
};
