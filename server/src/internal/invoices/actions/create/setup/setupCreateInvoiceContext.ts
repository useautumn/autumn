import type {
	CreateInvoiceParams,
	FullCustomer,
	FullProduct,
	InvoiceTemplate,
	StripeDiscountWithCoupon,
} from "@autumn/shared";
import { ErrCode, RecaseError } from "@autumn/shared";
import type Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli";
import { getOrCreateStripeCustomer } from "@/external/stripe/customers/operations/getOrCreateStripeCustomer";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { fetchStripeTaxRateForBilling } from "@/internal/billing/v2/providers/stripe/setup/fetchStripeTaxRateForBilling";
import { resolveParamDiscounts } from "@/internal/billing/v2/providers/stripe/utils/discounts/resolveParamDiscounts";
import { getOrCreateCustomer } from "@/internal/customers/cusUtils/getOrCreateCustomer";
import { InvoiceTemplateService } from "@/internal/orgs/invoiceTemplates/InvoiceTemplateService";
import { ProductService } from "@/internal/products/ProductService";
import type { InvoicePeriod } from "../compute/prorateInvoiceLineAmount";

export type InvoicePlanContext = {
	/** Distinguishes two entries for the same plan id. */
	planKey: string;
	params: NonNullable<CreateInvoiceParams["plans"]>[number];
	fullProduct: FullProduct;
	discounts: StripeDiscountWithCoupon[];
};

export type CreateInvoiceContext = {
	params: CreateInvoiceParams;
	fullCustomer: FullCustomer;
	stripeCustomer?: Stripe.Customer;
	currency: string;
	plans: InvoicePlanContext[];
	template?: InvoiceTemplate;
	daysUntilDue: number;
	period?: InvoicePeriod;
	taxRate?: Stripe.TaxRate;
	invoiceDiscounts: StripeDiscountWithCoupon[];
};

const DEFAULT_NET_TERMS_DAYS = 30;

// Stripe cannot apply a `repeating` coupon to a one-off invoice.
const rejectRepeatingCoupons = ({
	discounts,
}: {
	discounts: StripeDiscountWithCoupon[];
}) => {
	const repeating = discounts.find(
		(discount) => discount.source.coupon.duration === "repeating",
	);
	if (!repeating) return;
	throw new RecaseError({
		message: `Coupon ${repeating.source.coupon.id} repeats monthly and cannot be applied to a one-off invoice. Use a coupon with duration "once" or "forever".`,
		code: ErrCode.InvalidRequest,
		statusCode: 400,
	});
};

export const setupCreateInvoiceContext = async ({
	ctx,
	params,
	preview,
}: {
	ctx: AutumnContext;
	params: CreateInvoiceParams;
	preview: boolean;
}): Promise<CreateInvoiceContext> => {
	const hasCharges =
		(params.plans?.length ?? 0) > 0 ||
		(params.custom_line_items?.length ?? 0) > 0;
	if (!hasCharges) {
		throw new RecaseError({
			message: "Provide at least one plan or custom line item to invoice",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	const fullCustomer = await getOrCreateCustomer({
		ctx,
		customerId: params.customer_id,
	});

	const stripeCustomer = preview
		? undefined
		: await getOrCreateStripeCustomer({ ctx, customer: fullCustomer });

	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });

	const template = params.invoice_template_id
		? await InvoiceTemplateService.getById({
				db: ctx.db,
				orgId: ctx.org.id,
				id: params.invoice_template_id,
			})
		: undefined;
	if (params.invoice_template_id && !template) {
		throw new RecaseError({
			message: `Invoice template ${params.invoice_template_id} not found`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	const plans = await Promise.all(
		(params.plans ?? []).map(async (planParams, index) => {
			const fullProduct = await ProductService.getFull({
				db: ctx.db,
				idOrInternalId: planParams.plan_id,
				orgId: ctx.org.id,
				env: ctx.env,
				version: planParams.version,
				allowNotFound: true,
			});
			if (!fullProduct) {
				throw new RecaseError({
					message: `Plan ${planParams.plan_id} not found`,
					code: ErrCode.InvalidRequest,
					statusCode: 400,
				});
			}
			return {
				planKey: `${planParams.plan_id}#${index}`,
				params: planParams,
				fullProduct,
				discounts: await resolveParamDiscounts({
					stripeCli,
					discounts: planParams.discounts ?? [],
				}),
			};
		}),
	);

	const [invoiceDiscounts, taxRate] = await Promise.all([
		resolveParamDiscounts({ stripeCli, discounts: params.discounts ?? [] }),
		fetchStripeTaxRateForBilling({ ctx, taxRateId: params.tax_rate_id }),
	]);
	rejectRepeatingCoupons({
		discounts: [
			...invoiceDiscounts,
			...plans.flatMap((plan) => plan.discounts),
		],
	});

	return {
		params,
		fullCustomer,
		stripeCustomer,
		currency: fullCustomer.currency ?? ctx.org.default_currency ?? "usd",
		plans,
		template,
		daysUntilDue:
			params.net_terms_days ??
			template?.net_terms_days ??
			ctx.org.config.default_invoice_net_terms_days ??
			DEFAULT_NET_TERMS_DAYS,
		period:
			params.period_start !== undefined && params.period_end !== undefined
				? { start: params.period_start, end: params.period_end }
				: undefined,
		taxRate,
		invoiceDiscounts,
	};
};
