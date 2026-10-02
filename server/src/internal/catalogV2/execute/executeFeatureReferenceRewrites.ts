import {
	AllowanceType,
	EntInterval,
	type Feature,
	FeatureUsageType,
} from "@autumn/shared";
import { type SQL, sql } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type {
	FeatureRewritePlan,
	UpdateCreditSystemSchemaPlan,
	UpdateFeaturePlan,
} from "@/internal/catalogV2/actions/updateCatalog/types/updateFeaturePlan";
import type { FeatureRewriteScopeIds } from "@/internal/features/repos/featureReferenceRewriteScopes.js";
import { FeatureService } from "@/internal/features/FeatureService.js";

const scopeIds = ({
	ctx,
	updateFeaturePlan,
}: {
	ctx: AutumnContext;
	updateFeaturePlan: UpdateFeaturePlan;
}): FeatureRewriteScopeIds => {
	const internalFeatureId = updateFeaturePlan.current.internal_id;
	if (!internalFeatureId) {
		throw new Error(
			`Feature ${updateFeaturePlan.current.id} missing internal_id for reference rewrites`,
		);
	}
	return {
		orgId: ctx.org.id,
		env: ctx.env,
		internalFeatureId,
		featureId: updateFeaturePlan.current.id,
	};
};

const grantingEntitlementIdsSql = ({
	scope,
}: {
	scope: FeatureRewriteScopeIds;
}) => sql`
	SELECT entitlement.id
	FROM entitlements AS entitlement
	INNER JOIN features AS feature
		ON feature.internal_id = entitlement.internal_feature_id
	WHERE entitlement.internal_feature_id COLLATE "C" = ${scope.internalFeatureId}
		AND feature.org_id = ${scope.orgId}
		AND feature.env = ${scope.env}
`;

const entityFeatureIdEntitlementIdsSql = ({
	scope,
}: {
	scope: FeatureRewriteScopeIds;
}) => sql`
	SELECT entitlement.id
	FROM entitlements AS entitlement
	INNER JOIN features AS feature
		ON feature.internal_id = entitlement.internal_feature_id
	WHERE entitlement.entity_feature_id = ${scope.featureId}
		AND feature.org_id = ${scope.orgId}
		AND feature.env = ${scope.env}
`;

/** Build SET fragments for granting entitlements (one UPDATE — PG forbids double-touch). */
const grantingEntitlementSetSql = ({
	rewrites,
}: {
	rewrites: FeatureRewritePlan;
}): SQL | null => {
	const sets: SQL[] = [];

	if (rewrites.typeChange === "boolean_to_metered") {
		sets.push(
			sql`allowance_type = ${AllowanceType.Unlimited}`,
			sql`allowance = NULL`,
			sql`interval = ${EntInterval.Lifetime}`,
			sql`carry_from_previous = false`,
		);
	}

	if (rewrites.typeChange === "metered_to_boolean") {
		sets.push(
			sql`allowance_type = NULL`,
			sql`allowance = NULL`,
			sql`interval = NULL`,
			sql`entity_feature_id = NULL`,
			sql`carry_from_previous = false`,
		);
	}

	if (rewrites.idChange) {
		sets.push(sql`feature_id = ${rewrites.idChange.toId}`);
	}

	if (rewrites.usageTypeChange?.nextUsageType === FeatureUsageType.Continuous) {
		sets.push(sql`interval = ${EntInterval.Lifetime}`);
	}

	if (sets.length === 0) return null;
	return sql.join(sets, sql`, `);
};

/** Build price config patch (one UPDATE — id + usage both touch prices). */
const priceConfigSetSql = ({
	rewrites,
}: {
	rewrites: FeatureRewritePlan;
}): SQL | null => {
	if (!rewrites.idChange && !rewrites.usageTypeChange) return null;

	let configExpr: SQL = sql`config`;

	if (rewrites.idChange) {
		configExpr = sql`jsonb_set(
			${configExpr},
			'{feature_id}',
			to_jsonb(${rewrites.idChange.toId}::text),
			true
		)`;
	}

	if (rewrites.usageTypeChange) {
		const shouldProrate =
			rewrites.usageTypeChange.nextUsageType === FeatureUsageType.Continuous;
		configExpr = sql`jsonb_set(
			jsonb_set(
				${configExpr},
				'{should_prorate}',
				to_jsonb(${shouldProrate}::boolean),
				true
			),
			'{stripe_price_id}',
			'null'::jsonb,
			true
		)`;
	}

	return sql`config = ${configExpr}`;
};

/**
 * One round-trip: all needed entitlement/price UPDATEs as data-modifying CTEs.
 * Same-row touches are merged (Postgres rejects updating a row twice in one stmt).
 * Returns null when there is nothing to rewrite.
 */
export const buildFeatureReferenceRewritesSql = ({
	scope,
	rewrites,
}: {
	scope: FeatureRewriteScopeIds;
	rewrites: FeatureRewritePlan;
}): SQL | null => {
	const grantingSet = grantingEntitlementSetSql({ rewrites });
	const priceSet = priceConfigSetSql({ rewrites });
	const needsEntityScoped = rewrites.idChange != null;

	if (!grantingSet && !needsEntityScoped && !priceSet) return null;

	const cteParts: SQL[] = [];

	if (grantingSet) {
		cteParts.push(sql`granting AS (${grantingEntitlementIdsSql({ scope })})`);
		cteParts.push(sql`
			upd_granting AS (
				UPDATE entitlements
				SET ${grantingSet}
				WHERE id IN (SELECT id FROM granting)
				RETURNING 1
			)
		`);
	}

	if (needsEntityScoped && rewrites.idChange) {
		cteParts.push(
			sql`entity_scoped AS (${entityFeatureIdEntitlementIdsSql({ scope })})`,
		);
		cteParts.push(sql`
			upd_entity_feature_id AS (
				UPDATE entitlements
				SET entity_feature_id = ${rewrites.idChange.toId}
				WHERE id IN (SELECT id FROM entity_scoped)
				RETURNING 1
			)
		`);
	}

	if (priceSet) {
		cteParts.push(sql`
			upd_prices AS (
				UPDATE prices
				SET ${priceSet}
				WHERE org_id = ${scope.orgId}
					AND config ->> 'internal_feature_id' = ${scope.internalFeatureId}
				RETURNING 1
			)
		`);
	}

	return sql`
		WITH ${sql.join(cteParts, sql`, `)}
		SELECT 1
	`;
};

/**
 * Entitlement/price batch UPDATEs for one feature update — one DB round-trip.
 * Entitlement targets always go through INNER JOIN features (org + env).
 */
export const executeFeatureReferenceRewrites = async ({
	ctx,
	updateFeaturePlan,
}: {
	ctx: AutumnContext;
	updateFeaturePlan: UpdateFeaturePlan;
}) => {
	const query = buildFeatureReferenceRewritesSql({
		scope: scopeIds({ ctx, updateFeaturePlan }),
		rewrites: updateFeaturePlan.rewrites,
	});
	if (!query) return;
	await ctx.db.execute(query);
};

/** Flatten per-feature credit-schema bags (last config wins). */
export const coalesceCreditSystemSchemaRewrites = ({
	updateFeatures,
}: {
	updateFeatures: { rewrites: FeatureRewritePlan }[];
}): UpdateCreditSystemSchemaPlan[] => {
	const configs = new Map<string, Feature["config"]>();
	for (const { rewrites } of updateFeatures) {
		for (const { id, config } of rewrites.updateCreditSystemSchemas) {
			configs.set(id, config);
		}
	}
	return [...configs].map(([id, config]) => ({ id, config }));
};

export const executeCreditSystemSchemaRewrites = async ({
	ctx,
	updateCreditSystemSchemas,
}: {
	ctx: AutumnContext;
	updateCreditSystemSchemas: UpdateCreditSystemSchemaPlan[];
}) => {
	await Promise.all(
		updateCreditSystemSchemas.map(({ id, config }) =>
			FeatureService.update({
				db: ctx.db,
				id,
				orgId: ctx.org.id,
				env: ctx.env,
				updates: { config },
			}),
		),
	);
};
