import { ErrCode, type Feature, RecaseError } from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { isStripeConnected } from "@/internal/orgs/orgUtils.js";

export const fillFeatureStripeMeterEventName = async ({
	ctx,
	feature,
}: {
	ctx: AutumnContext;
	feature: Feature;
}): Promise<Feature> => {
	const meter = feature.stripe_meter;
	if (!meter?.id || meter.event_name) return feature;

	if (!isStripeConnected({ org: ctx.org, env: ctx.env })) {
		throw new RecaseError({
			message:
				"Stripe must be connected to set processors.stripe.meter_id on a feature.",
			code: ErrCode.StripeConfigNotFound,
			statusCode: 400,
		});
	}

	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
	try {
		const stripeMeter = await stripeCli.billing.meters.retrieve(meter.id);
		feature.stripe_meter = {
			id: stripeMeter.id,
			event_name: stripeMeter.event_name,
		};
		return feature;
	} catch {
		throw new RecaseError({
			message: `Stripe meter ${meter.id} could not be retrieved.`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
};
