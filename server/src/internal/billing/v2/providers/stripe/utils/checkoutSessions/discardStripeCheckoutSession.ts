import type Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { MetadataService } from "@/internal/metadata/MetadataService";

export const discardStripeCheckoutSession = async ({
	ctx,
	session,
}: {
	ctx: AutumnContext;
	session: Pick<Stripe.Checkout.Session, "id"> &
		Partial<Pick<Stripe.Checkout.Session, "metadata" | "status">>;
}) => {
	if (!session.status || session.status === "open") {
		const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
		await stripeCli.checkout.sessions.expire(session.id);
	}

	const metadataId = session.metadata?.autumn_metadata_id;
	if (metadataId) await MetadataService.delete({ db: ctx.db, id: metadataId });
};
