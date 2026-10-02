import { inAtomRollout } from "@autumn/edge-config";
import type { CheckParams } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getShadowAtomConfig } from "@/internal/misc/shadowAtom/shadowAtomConfigStore.js";
import { decryptData } from "@/utils/encryptUtils.js";
import type { AtomShadowTarget } from "./types/atomShadowOutcome.js";

/** Mirrors Atom's FORWARD_RULES (apps/atom checkForwardRules.ts): Atom hands these to the API, so a shadow would run them twice. */
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

/** Our shadow Atom for this env, or null unless it has an address, a token, and holds this customer. Never the org's own Atom. */
export const shadowAtomTarget = ({
	ctx,
	customerId,
}: {
	ctx: AutumnContext;
	customerId: string;
}): AtomShadowTarget | null => {
	const config = getShadowAtomConfig()[ctx.env];
	if (!config.endpointUrl || !config.encryptedToken) return null;
	if (!inAtomRollout({ config, orgId: ctx.org.id, customerId })) return null;
	return {
		endpointUrl: config.endpointUrl,
		token: decryptData(config.encryptedToken),
	};
};
