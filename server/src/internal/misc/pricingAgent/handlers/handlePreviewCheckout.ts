import { Scopes } from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { runCheckout } from "@/internal/billing/checkout/runCheckout.js";
import {
	buildPreviewContext,
	getSessionPreviewOrg,
} from "./previewOrgUtils.js";

const PREVIEW_CUSTOMER_ID = "preview_customer";

const PreviewCheckoutSchema = z.object({
	product_id: z.string(),
	success_path: z.string().optional(),
});

export const buildSuccessUrl = ({
	successPath,
}: {
	successPath?: string;
}): string => {
	const origin = (process.env.CLIENT_URL || "http://localhost:3000").replace(
		/\/+$/,
		"",
	);

	if (!successPath) return origin;

	try {
		const base = new URL(`${origin}/`);
		const resolved = new URL(successPath, base);

		return resolved.origin === base.origin ? resolved.toString() : origin;
	} catch {
		return origin;
	}
};

export const handlePreviewCheckout = createRoute({
	scopes: { ALL: [Scopes.Billing.Write, Scopes.Customers.Write] },
	body: PreviewCheckoutSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const body = c.req.valid("json");

		const previewOrg = await getSessionPreviewOrg({ ctx });
		const previewCtx = await buildPreviewContext({
			ctx,
			previewOrg,
			withFeatures: true,
		});

		const checkoutRes = await runCheckout({
			ctx: previewCtx,
			checkoutParams: {
				customer_id: PREVIEW_CUSTOMER_ID,
				product_id: body.product_id,
				success_url: buildSuccessUrl({ successPath: body.success_path }),
			},
		});

		return c.json({ url: checkoutRes.url });
	},
});
