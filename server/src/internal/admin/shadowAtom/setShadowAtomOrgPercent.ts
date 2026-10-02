import { scheduleOrgPercent } from "@autumn/edge-config";
import { type AppEnv, ErrCode, RecaseError } from "@autumn/shared";
import { withLock } from "@/external/redis/utils/lockUtils/withLock.js";
import {
	SHADOW_ATOM_CONFIG_LOCK_KEY,
	shadowAtomConfigStore,
} from "@/internal/misc/shadowAtom/shadowAtomConfigStore.js";

/** A registered org's share of customers on the shadow Atom; the change routes once settled. */
export const setShadowAtomOrgPercent = ({
	env,
	orgId,
	percent,
}: {
	env: AppEnv;
	orgId: string;
	percent: number;
}): Promise<void> =>
	withLock({
		lockKey: SHADOW_ATOM_CONFIG_LOCK_KEY,
		fn: async () => {
			const config = await shadowAtomConfigStore.readFromSource();
			const { orgs } = config[env];
			// Own keys only: an id like "constructor" must not read Object.prototype as an org.
			const current = Object.hasOwn(orgs, orgId) ? orgs[orgId] : undefined;
			if (!current)
				throw new RecaseError({
					message:
						"Register the org on the shadow Atom before setting its percent.",
					code: ErrCode.InvalidRequest,
					statusCode: 404,
				});
			const org = {
				...current,
				...scheduleOrgPercent({ current, percent, now: Date.now() }),
			};
			await shadowAtomConfigStore.writeToSource({
				config: {
					...config,
					[env]: {
						...config[env],
						orgs: { ...config[env].orgs, [orgId]: org },
					},
				},
			});
		},
	});
