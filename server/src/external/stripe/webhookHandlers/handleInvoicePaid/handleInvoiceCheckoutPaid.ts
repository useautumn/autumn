import type { Metadata } from "@autumn/shared";
import { AttachScenario } from "@autumn/shared";
import { createFullCusProduct } from "@/internal/customers/add-product/createFullCusProduct.js";
import type { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import { attachToInsertParams } from "@/internal/products/productUtils.js";
import type { AutumnContext } from "../../../../honoUtils/HonoEnv.js";
import { CusService } from "../../../../internal/customers/CusService.js";
import { deleteCachedApiCustomer } from "../../../../internal/customers/cusUtils/apiCusCacheUtils/deleteCachedApiCustomer.js";
import { MetadataService } from "../../../../internal/metadata/MetadataService.js";

export const handleInvoiceCheckoutPaid = async ({
	ctx,
	metadata,
}: {
	ctx: AutumnContext;
	metadata: Metadata;
}) => {
	const { logger, org, env, db } = ctx;
	logger.info(
		`invoice.paid, handling invoice checkout paid for metadata: ${metadata.id}`,
	);

	const { subId, anchorToUnix, config, ...rest } =
		metadata.data as AttachParams;

	const attachParams = rest;

	if (!attachParams) return;

	const reqMatch =
		attachParams.org.id === org.id && attachParams.customer.env === env;

	if (!reqMatch) return;

	const batchInsert = [];
	for (const product of attachParams.products) {
		batchInsert.push(
			createFullCusProduct({
				db,
				attachParams: attachToInsertParams(attachParams, product),
				subscriptionIds: subId ? [subId] : undefined,
				anchorToUnix,
				carryExistingUsages: config?.carryUsage,
				scenario: AttachScenario.New,
				logger: logger,
			}),
		);
	}

	await Promise.all(batchInsert);

	logger.info(
		`✅ invoice.paid, successfully inserted cus products: ${attachParams.products.map((p) => p.id).join(", ")}`,
	);

	await MetadataService.delete({
		db: ctx.db,
		id: metadata.id,
	});

	// Fetch customer by internal ID
	let customerId = attachParams.customer.id;

	if (!customerId) {
		const customer = await CusService.get({
			db,
			idOrInternalId: attachParams.customer.internal_id,
			orgId: org.id,
			env,
		});

		customerId = customer?.id;
	}

	await deleteCachedApiCustomer({
		customerId: customerId || "",
		orgId: org.id,
		env,
	});
};
