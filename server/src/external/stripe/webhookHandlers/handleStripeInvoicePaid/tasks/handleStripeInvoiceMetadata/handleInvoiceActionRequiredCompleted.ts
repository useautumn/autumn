import { AttachBranch, type Metadata, ProrationBehavior } from "@autumn/shared";
import type Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { getCusPaymentMethod } from "@/external/stripe/stripeCusUtils.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { resetUsageBalances } from "@/internal/customers/attach/attachFunctions/upgradeDiffIntFlow/createUsageInvoiceItems.js";
import { handleUpgradeFlow } from "@/internal/customers/attach/attachFunctions/upgradeFlow/handleUpgradeFlow.js";
import { attachParamsToCurCusProduct } from "@/internal/customers/attach/attachUtils/convertAttachParams.js";
import { getDefaultAttachConfig } from "@/internal/customers/attach/attachUtils/getAttachConfig.js";
import type { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import { MetadataService } from "@/internal/metadata/MetadataService.js";

export const handleInvoiceActionRequiredCompleted = async ({
	ctx,
	stripeInvoice,
	metadata,
}: {
	ctx: AutumnContext;
	stripeInvoice: Stripe.Invoice;
	metadata: Metadata;
}) => {
	const { logger, org, env } = ctx;
	logger.info(`invoice.paid, handling action required`);

	const stripeCli = createStripeCli({ org, env });

	const paymentMethod = await getCusPaymentMethod({
		stripeCli,
		stripeId: stripeInvoice.customer as string,
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

	ctx.logger.info(`handling upgrade flow for invoice ${stripeInvoice.id}`);

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
};
