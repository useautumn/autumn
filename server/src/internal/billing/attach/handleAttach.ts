import { type AttachResponseV1, AttachResponseV1Schema } from "@autumn/shared";
import { AttachBodyV0Schema } from "../../../../../shared/api/billing/attach/prevVersions/attachBodyV0";
import {
	AffectedResource,
	applyResponseVersionChanges,
} from "../../../../../shared/api/versionUtils/versionUtils";
import { createRoute } from "../../../honoMiddlewares/routeHandler";
import { checkStripeConnections } from "../../customers/attach/attachRouter";
import { getAttachParams } from "../../customers/attach/attachUtils/attachParams/getAttachParams";
import { getAttachBranch } from "../../customers/attach/attachUtils/getAttachBranch";
import { getAttachConfig } from "../../customers/attach/attachUtils/getAttachConfig";
import { runAttachFunction } from "../../customers/attach/attachUtils/getAttachFunction";
import { handleAttachErrors } from "../../customers/attach/attachUtils/handleAttachErrors";
import { insertCustomItems } from "../../customers/attach/attachUtils/insertCustomItems";
import { attachToInvoiceResponse } from "../../invoices/invoiceUtils";

export const handleAttach = createRoute({
	body: AttachBodyV0Schema,
	resource: AffectedResource.Attach,

	lock:
		process.env.NODE_ENV !== "development"
			? {
					ttlMs: 60000,
					errorMessage:
						"Attach already in progress for this customer, try again in a few seconds",

					getKey: (c) => {
						const ctx = c.get("ctx");
						const attachBody = c.req.valid("json");
						return `lock:attach:${ctx.org.id}:${ctx.env}:${attachBody.customer_id}`;
					},
				}
			: undefined,

	handler: async (c) => {
		// await handleAttachRaceCondition({ req, res });
		const ctx = c.get("ctx");
		const attachBody = c.req.valid("json");

		const { attachParams, customPrices, customEnts } = await getAttachParams({
			ctx,
			attachBody,
		});

		// Handle existing product
		const branch = await getAttachBranch({
			ctx,
			attachBody,
			attachParams,
		});

		attachParams.branch = branch; // important!

		const { flags, config } = await getAttachConfig({
			ctx,
			attachParams,
			attachBody,
			branch,
		});

		await handleAttachErrors({
			attachParams,
			attachBody,
			branch,
			flags,
			config,
		});

		await checkStripeConnections({
			ctx,
			attachParams,
			useCheckout: config.onlyCheckout,
		});

		await insertCustomItems({
			db: ctx.db,
			customPrices: customPrices || [],
			customEnts: customEnts || [],
		});

		try {
			ctx.logger.info(`Attach params: `, {
				data: {
					products: attachParams.products.map((p) => ({
						id: p.id,
						name: p.name,
						processor: p.processor,
						version: p.version,
					})),
					prices: attachParams.prices.map((p) => ({
						id: p.id,
						config: p.config,
					})),
					entitlements: attachParams.entitlements.map((e) => ({
						internal_feature_id: e.internal_feature_id,
						feature_id: e.feature_id,
					})),
					freeTrial: attachParams.freeTrial,
				},
			});
		} catch (_error) {}

		const response = await runAttachFunction({
			ctx,
			attachParams,
			branch,
			attachBody,
			config,
		});

		const { products, customer } = attachParams;

		const responseV1 = AttachResponseV1Schema.parse({
			success: true,
			product_ids: products.map((p) => p.id),
			customer_id: customer.id || customer.internal_id,
			...response,
			invoice: response.invoice
				? attachToInvoiceResponse({ invoice: response.invoice })
				: undefined,
		});

		return c.json(
			applyResponseVersionChanges<AttachResponseV1>({
				input: responseV1,
				targetVersion: ctx.apiVersion,
				resource: AffectedResource.Attach,
				ctx,
			}),
		);
	},
});
