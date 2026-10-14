import type { EdgeConfigStore, ShadowAtomConfig } from "@autumn/edge-config";
import type { AutumnLogger } from "@autumn/logging";
import { AppEnv } from "@autumn/shared";

type PushCatalog = (params: { orgId: string; env: AppEnv }) => Promise<void>;

/** Who the shadow Atom answers for: no address means it takes nothing. */
const shadowedOrgIds = ({ config }: { config: ShadowAtomConfig }) =>
	config.endpointUrl ? Object.keys(config.orgs) : [];

/** Which shadow Atom it is: a new endpoint or deployment is a fresh Atom with no catalog; a transport switch is not. */
const shadowAddressOf = ({ config }: { config: ShadowAtomConfig }) =>
	JSON.stringify([config.endpointUrl, config.externalId]);

/**
 * Catalog changes reach an Atom only when the catalog changes, so the shadow Atom gets each org's catalog
 * as it starts taking that org: on start, when an org is added, and when the shadow Atom moves.
 */
export function createShadowAtomCatalogPush({
	ctx,
}: {
	ctx: {
		shadowAtomConfig: Pick<
			EdgeConfigStore<ShadowAtomConfig>,
			"get" | "subscribe"
		>;
		pushCatalog: PushCatalog;
		logger: Pick<AutumnLogger, "warn" | "error">;
	};
}) {
	let unsubscribe: (() => void) | null = null;
	let seen = ctx.shadowAtomConfig.get();
	let pushing: Promise<void> = Promise.resolve();

	async function pushOrgs({ orgIds }: { orgIds: string[] }): Promise<void> {
		await Promise.all(
			orgIds.flatMap((orgId) =>
				Object.values(AppEnv).map((env) => pushOrg({ orgId, env })),
			),
		);
	}

	async function pushOrg({
		orgId,
		env,
	}: {
		orgId: string;
		env: AppEnv;
	}): Promise<void> {
		try {
			await ctx.pushCatalog({ orgId, env });
		} catch (cause) {
			ctx.logger.warn(
				{
					error: cause,
					type: "herald_shadow_catalog_push_failed",
					data: { orgId, env },
				},
				"Herald could not send an org's catalog to the shadow Atom; it waits for the next catalog change",
			);
		}
	}

	function onConfig(next: ShadowAtomConfig): void {
		const previous = seen;
		seen = next;
		const moved =
			shadowAddressOf({ config: previous }) !==
			shadowAddressOf({ config: next });
		const known = new Set(moved ? [] : shadowedOrgIds({ config: previous }));
		const orgIds = shadowedOrgIds({ config: next }).filter(
			(orgId) => !known.has(orgId),
		);
		if (orgIds.length === 0) return;
		pushing = pushing.then(() => pushOrgs({ orgIds }));
	}

	async function start(): Promise<void> {
		unsubscribe ??= ctx.shadowAtomConfig.subscribe(onConfig);
		seen = ctx.shadowAtomConfig.get();
		pushing = pushOrgs({ orgIds: shadowedOrgIds({ config: seen }) });
		await pushing;
	}

	function stop(): void {
		unsubscribe?.();
		unsubscribe = null;
	}

	/** Resolves once every push started so far has finished. */
	function settled(): Promise<void> {
		return pushing;
	}

	return { start, stop, settled };
}
