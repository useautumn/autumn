import { Scopes } from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { runCheckout } from "@/internal/billing/checkout/runCheckout.js";
import {
	buildPreviewContext,
	getSessionPreviewOrg,
} from "./previewOrgUtils.js";

/** Every preview checkout runs against this single throwaway customer. */
const PREVIEW_CUSTOMER_ID = "preview_customer";

const PreviewCheckoutSchema = z.object({
	product_id: z.string(),
	/**
	 * Dashboard-relative path Stripe returns the user to. Only a path is
	 * accepted — the origin is fixed server-side so this can't be turned into
	 * an open redirect.
	 */
	success_path: z.string().optional(),
});

/**
 * Resolves the client-supplied path against the dashboard origin and drops it
 * if it escapes that origin — so an absolute or protocol-relative value can't
 * turn the Stripe success redirect into an open redirect.
 */
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

/**
 * Creates a Stripe checkout session against the user's preview sandbox org.
 *
 * Runs server-side under session auth: the preview org is resolved from the
 * session, so no sandbox API key has to be handed to the browser.
 */
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

		// Only the checkout URL is needed by the preview UI — the rest of the
		// checkout response describes sandbox pricing the client already has.
		return c.json({ url: checkoutRes.url });
	},
});
