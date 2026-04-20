import {
	AffectedResource,
	applyResponseVersionChanges,
	type CheckResponseV3,
	type Feature,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

export const transformCheckResponse = ({
	ctx,
	response,
	featureToUse,
	noCusEnts,
}: {
	ctx: AutumnContext;
	response: CheckResponseV3;
	featureToUse: Feature;
	noCusEnts: boolean;
}) =>
	applyResponseVersionChanges<CheckResponseV3>({
		input: response,
		targetVersion: ctx.apiVersion,
		resource: AffectedResource.Check,
		legacyData: {
			noCusEnts,
			featureToUse,
		},
		ctx,
	});
