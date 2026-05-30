import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { getInvoiceSubscriptionId } from "@/external/vercel/misc/vercelInvoiceUtils.js";
import { provisionVercelCusProduct } from "@/external/vercel/misc/vercelProvisioning.js";
import { VercelResourceService } from "@/external/vercel/services/VercelResourceService.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { CusService } from "@/internal/customers/CusService.js";
import { customerProductRepo } from "@/internal/customers/cusProducts/repos";
import { logCaughtError } from "@/utils/logging/logCaughtError.js";

export const handleMarketplaceInvoiceCreated = async ({
	ctx,
	payload,
}: {
	ctx: AutumnContext;
	payload: {
		installationId: string;
		invoiceId: string;
		externalInvoiceId: string;
		invoiceTotal: string;
		period: { start: string; end: string };
		invoiceDate: string;
	};
}) => {
	const { db, org, env, logger } = ctx;
	const { installationId, externalInvoiceId } = payload;

	const stripeCli = createStripeCli({ org, env });

	// 1. Retrieve invoice
	const invoice = await stripeCli.invoices.retrieve(externalInvoiceId, {
		expand: ["subscription"],
	});

	// 2. Find subscription ID
	const subscriptionId = getInvoiceSubscriptionId(invoice);
	if (!subscriptionId) {
		logger.info(
			"No subscription on invoice; skipping invoice.created provisioning",
		);
		return;
	}

	// 3. Fetch subscription
	const subscription = await stripeCli.subscriptions.retrieve(subscriptionId);

	// 4. Check if cus_product already exists for this subscription
	const existingCusProducts = await customerProductRepo.getByStripeSubId({
		db,
		stripeSubId: subscriptionId,
		orgId: org.id,
		env,
	});

	if (existingCusProducts.length > 0) {
		logger.info(
			"cus_product already exists; invoice.created safety-net is a no-op",
			{
				data: { subscriptionId, count: existingCusProducts.length },
			},
		);
		return;
	}

	// 5. Provision (safety net for cases where resource-creation didn't provision)
	const vercelBillingPlanId = subscription.metadata?.vercel_billing_plan_id;
	if (!vercelBillingPlanId) {
		logger.error(
			"No vercel_billing_plan_id in subscription metadata; cannot provision",
			{
				data: { subscriptionId },
			},
		);
		return;
	}

	const vercelResourceId = subscription.metadata?.vercel_resource_id;

	// Fetch customer
	const partialCustomer = await CusService.getByStripeId({
		ctx,
		stripeId: invoice.customer as string,
	});
	if (!partialCustomer) {
		logger.error("Customer not found for invoice.created", {
			data: { stripeCustomerId: invoice.customer },
		});
		return;
	}
	const customer = await CusService.getFull({
		ctx,
		idOrInternalId: partialCustomer.internal_id,
	});
	if (!customer) {
		logger.error("Customer not found (full) for invoice.created");
		return;
	}

	const stripeCustomer = await stripeCli.customers.retrieve(
		customer.processor.id,
		{ expand: ["subscriptions"] },
	);
	if (stripeCustomer.deleted) {
		logger.error("Stripe customer deleted; cannot provision");
		return;
	}

	// Fetch resource metadata for prepaid parsing (if any)
	let resourceMetadata: Record<string, any> | undefined;
	if (vercelResourceId?.startsWith("vre_")) {
		try {
			const resource = await VercelResourceService.getById({
				db,
				resourceId: vercelResourceId,
				orgId: org.id,
				env,
			});
			if (resource?.metadata && Object.keys(resource.metadata).length > 0) {
				resourceMetadata = resource.metadata as Record<string, any>;
			}
		} catch (error) {
			logCaughtError({
				logger,
				message:
					"[vercel/marketplace.invoice.created] could not fetch resource metadata",
				error,
				data: { resourceId: vercelResourceId },
				level: "warn",
			});
		}
	}

	try {
		await provisionVercelCusProduct({
			ctx,
			customer,
			stripeCustomer,
			stripeCli,
			integrationConfigurationId: installationId,
			billingPlanId: vercelBillingPlanId,
			resourceId: vercelResourceId,
			metadata: resourceMetadata,
		});
		logger.info("Provisioned cus_product via invoice.created safety net", {
			data: { subscriptionId, billingPlanId: vercelBillingPlanId },
		});
	} catch (error: any) {
		if (error?.code === "vercel_provisioning_in_flight") {
			logger.info(
				"invoice.created safety net skipped — original provision still in flight",
				{ data: { subscriptionId } },
			);
			return;
		}
		throw error;
	}
};
