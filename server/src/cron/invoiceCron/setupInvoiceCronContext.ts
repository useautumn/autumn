import type { DeferredAutumnBillingPlanData, Metadata } from "@autumn/shared";
import type { Stripe } from "stripe";
import type { RepoContext } from "@/db/repoContext";
import { createStripeCli } from "@/external/connect/createStripeCli";
import { resolveRedisV2 } from "@/external/redis/resolveRedisV2.js";
import type { AttachParams } from "@/internal/customers/cusProducts/AttachParams";
import { OrgService } from "@/internal/orgs/OrgService";
import type { CronContext } from "../utils/CronContext";

const getOrgAndCustomerFromMetadata = async ({
	ctx,
	metadata,
}: {
	ctx: CronContext;
	metadata: Metadata;
}) => {
	const { db } = ctx;
	const data = metadata.data as AttachParams | DeferredAutumnBillingPlanData;
	if ("org" in data) {
		return { org: data.org, customer: data.customer };
	} else if ("orgId" in data) {
		const { orgId, env } = data;
		const orgWithFeatures = await OrgService.getWithFeatures({
			db,
			orgId,
			env,
			allowNotFound: true,
		});

		return {
			org: orgWithFeatures?.org,
			customer: data.billingContext?.fullCustomer,
		};
	}

	return { org: undefined, customer: undefined };
};

export const setupInvoiceCronContext = async ({
	ctx,
	metadata,
}: {
	ctx: CronContext;
	metadata: Metadata;
}) => {
	const { logger, db } = ctx;

	const { org, customer } = await getOrgAndCustomerFromMetadata({
		ctx,
		metadata,
	});
	if (!org || !customer) return undefined;

	const stripeCli = createStripeCli({ org, env: customer.env });

	if (!metadata.stripe_invoice_id) return undefined;

	let stripeInvoice: Stripe.Invoice;
	try {
		stripeInvoice = await stripeCli.invoices.retrieve(
			metadata.stripe_invoice_id,
		);
	} catch {
		logger.warn(`Failed to retrieve invoice ${metadata.stripe_invoice_id}`);
		return undefined;
	}

	console.log(
		`Invoice: ${metadata.stripe_invoice_id} for customer ${customer.id} (org: ${org.slug}) - status: ${stripeInvoice.status}`,
	);

	const repoContext: RepoContext = {
		db,
		logger,
		org: { id: org.id },
		env: customer.env,
		redisV2: resolveRedisV2(),
	};

	return { org, customer, stripeCli, stripeInvoice, repoContext };
};

export type InvoiceCronContext = NonNullable<
	Awaited<ReturnType<typeof setupInvoiceCronContext>>
>;
