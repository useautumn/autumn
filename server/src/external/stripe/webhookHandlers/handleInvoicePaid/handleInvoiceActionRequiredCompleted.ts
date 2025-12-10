import { AttachBranch, type Metadata, ProrationBehavior } from "@autumn/shared";
import { createStripeCli } from "@server/external/connect/createStripeCli";
import { getCusPaymentMethod } from "@server/external/stripe/stripeCusUtils";
import type { AutumnContext } from "@server/honoUtils/HonoEnv";
import { resetUsageBalances } from "@server/internal/customers/attach/attachFunctions/upgradeDiffIntFlow/createUsageInvoiceItems";
import { handleUpgradeFlow } from "@server/internal/customers/attach/attachFunctions/upgradeFlow/handleUpgradeFlow";
import { attachParamsToCurCusProduct } from "@server/internal/customers/attach/attachUtils/convertAttachParams";
import { getDefaultAttachConfig } from "@server/internal/customers/attach/attachUtils/getAttachConfig";
import type { AttachParams } from "@server/internal/customers/cusProducts/AttachParams";
import { deleteCachedApiCustomer } from "@server/internal/customers/cusUtils/apiCusCacheUtils/deleteCachedApiCustomer";
import { MetadataService } from "@server/internal/metadata/MetadataService";
import type Stripe from "stripe";

export const handleInvoiceActionRequiredCompleted = async ({
	ctx,
	invoice,
	metadata,
}: {
	ctx: AutumnContext;
	invoice: Stripe.Invoice;
	metadata: Metadata;
}) => {
	const { logger, org, env } = ctx;
	logger.info(`invoice.paid, handling action required`);

	const stripeCli = createStripeCli({ org, env });

	const paymentMethod = await getCusPaymentMethod({
		stripeCli,
		stripeId: invoice.customer as string,
	});

	const attachParams = {
		...(metadata.data as AttachParams),
		stripeCli,
		req: ctx,
		paymentMethod,
	} as AttachParams;

	const attachConfig = {
		...getDefaultAttachConfig(),
		proration: ProrationBehavior.None,
	};

	ctx.logger.info(`handling upgrade flow for invoice ${invoice.id}`);

	await handleUpgradeFlow({
		ctx,
		attachParams,
		config: attachConfig,
		branch: AttachBranch.Upgrade,
	});

	const curCusProduct = attachParamsToCurCusProduct({ attachParams });
	if (attachParams.cusEntIds && curCusProduct) {
		await resetUsageBalances({
			db: ctx.db,
			cusEntIds: attachParams.cusEntIds,
			cusProduct: curCusProduct,
		});
	}

	await MetadataService.delete({
		db: ctx.db,
		id: metadata.id,
	});

	await deleteCachedApiCustomer({
		customerId: attachParams.customer.id || "",
		orgId: attachParams.org.id,
		env: attachParams.customer.env,
	});
};
