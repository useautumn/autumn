import { inAtomRollout } from "@autumn/edge-config";
import type { CheckParams } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getShadowAtomConfig } from "@/internal/misc/shadowAtom/shadowAtomConfigStore.js";
import { decryptData } from "@/utils/encryptUtils.js";
import type { AtomShadowTarget } from "./types/atomShadowOutcome.js";

export const isAtomAnswerableCheck = ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: CheckParams;
}): boolean => {
	const isProductCheck = !params.feature_id || Boolean(params.product_id);
	const writesBalances =
		params.send_event === true || params.lock !== undefined;
	const readsPostgres = params.with_preview === true || ctx.skipCache;
	const canCreateSubject =
		params.customer_data !== undefined || params.entity_data !== undefined;
	return (
		!isProductCheck && !writesBalances && !readsPostgres && !canCreateSubject
	);
};

export const shadowAtomTarget = ({
	ctx,
	customerId,
}: {
	ctx: AutumnContext;
	customerId: string;
}): AtomShadowTarget | null => {
	const config = getShadowAtomConfig();
	if (!config.endpointUrl) return null;
	if (!inAtomRollout({ config, orgId: ctx.org.id, customerId })) return null;
	return {
		endpointUrl: config.endpointUrl,
		token: decryptData(config.orgs[ctx.org.id].encryptedTokens[ctx.env]),
	};
};
