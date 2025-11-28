import { AttachBranch, type Metadata, ProrationBehavior } from "@autumn/shared";
import type Stripe from "stripe";
import type { AutumnContext } from "../../../../honoUtils/HonoEnv";
import { resetUsageBalances } from "../../../../internal/customers/attach/attachFunctions/upgradeDiffIntFlow/createUsageInvoiceItems";
import { handleUpgradeFlow } from "../../../../internal/customers/attach/attachFunctions/upgradeFlow/handleUpgradeFlow";
import { attachParamToCusProducts } from "../../../../internal/customers/attach/attachUtils/convertAttachParams";
import { getDefaultAttachConfig } from "../../../../internal/customers/attach/attachUtils/getAttachConfig";
import type { AttachParams } from "../../../../internal/customers/cusProducts/AttachParams";
import { deleteCachedApiCustomer } from "../../../../internal/customers/cusUtils/apiCusCacheUtils/deleteCachedApiCustomer";
import { MetadataService } from "../../../../internal/metadata/MetadataService";
import { createStripeCli } from "../../../connect/createStripeCli";
import { getCusPaymentMethod } from "../../stripeCusUtils";

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

	const { curMainProduct } = attachParamToCusProducts({ attachParams });

	await handleUpgradeFlow({
		ctx,
		attachParams,
		config: attachConfig,
		branch: AttachBranch.Upgrade,
	});

	if (attachParams.cusEntIds && curMainProduct) {
		await resetUsageBalances({
			db: ctx.db,
			cusEntIds: attachParams.cusEntIds,
			cusProduct: curMainProduct,
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
