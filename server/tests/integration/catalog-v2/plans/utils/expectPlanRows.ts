import { expect } from "bun:test";
import {
	customerEntitlements,
	customerPrices,
	entitlements,
	isFixedPrice,
	prices,
} from "@autumn/shared";
import { eq } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";

type PlanEntSnapshot = {
	id: string;
	allowance: number | null;
	internalFeatureId: string;
};

type PlanBasePriceSnapshot = {
	id: string;
	amount: number | null;
};

export type PlanRowsSnapshot = {
	planId: string;
	version?: number;
	internalProductId: string;
	entIds: string[];
	featurePriceIds: string[];
	basePriceId: string | null;
	baseAmount: number | null;
	ents: Record<string, PlanEntSnapshot>;
	entsByFeature: Record<string, PlanEntSnapshot[]>;
	basePrices: PlanBasePriceSnapshot[];
};

export const snapshotPlanRows = async ({
	ctx,
	planId,
	version,
}: {
	ctx: AutumnContext;
	planId: string;
	version?: number;
}): Promise<PlanRowsSnapshot> => {
	const full = await ProductService.getFull({
		db: ctx.db,
		idOrInternalId: planId,
		orgId: ctx.org.id,
		env: ctx.env,
		version,
	});

	const ents: Record<string, PlanEntSnapshot> = {};
	const entsByFeature: Record<string, PlanEntSnapshot[]> = {};
	for (const ent of full.entitlements) {
		const snapshot: PlanEntSnapshot = {
			id: ent.id,
			allowance: ent.allowance ?? null,
			internalFeatureId: ent.internal_feature_id,
		};
		if (!ents[ent.feature.id]) ents[ent.feature.id] = snapshot;
		const featureEnts = entsByFeature[ent.feature.id] ?? [];
		featureEnts.push(snapshot);
		entsByFeature[ent.feature.id] = featureEnts;
	}

	const basePrices = full.prices.filter(isFixedPrice).map((price) => ({
		id: price.id,
		amount: (price.config as { amount?: number })?.amount ?? null,
	}));

	return {
		planId,
		version,
		internalProductId: full.internal_id,
		entIds: full.entitlements.map((ent) => ent.id).sort(),
		featurePriceIds: full.prices
			.filter((price) => !isFixedPrice(price))
			.map((price) => price.id)
			.sort(),
		basePriceId: basePrices[0]?.id ?? null,
		baseAmount: basePrices[0]?.amount ?? null,
		ents,
		entsByFeature,
		basePrices,
	};
};

const fetchEntRow = async ({
	ctx,
	entId,
}: {
	ctx: AutumnContext;
	entId: string;
}) => {
	const [row] = await ctx.db
		.select()
		.from(entitlements)
		.where(eq(entitlements.id, entId))
		.limit(1);
	return row ?? null;
};

const fetchPriceRow = async ({
	ctx,
	priceId,
}: {
	ctx: AutumnContext;
	priceId: string;
}) => {
	const [row] = await ctx.db
		.select()
		.from(prices)
		.where(eq(prices.id, priceId))
		.limit(1);
	return row ?? null;
};

export type ExpectedPlanRows = {
	stableEnts?: true | string[];
	stableFeaturePrices?: true;
	stableBase?: true;
	mintedEnts?: { featureId: string; allowance: number }[];
	mintedBase?: { amount: number };
	absentFeatures?: string[];
	deletedEnts?: string[];
	retiredEnts?: string[];
	deletedPrices?: string[];
	retiredPrices?: string[];
	survivingCusEnts?: string[];
	survivingCusPrices?: string[];
	noCustomStamps?: true;
};

export const expectPlanRowsCorrect = async ({
	ctx,
	before,
	expected,
}: {
	ctx: AutumnContext;
	before: PlanRowsSnapshot;
	expected: ExpectedPlanRows;
}) => {
	const after = await snapshotPlanRows({
		ctx,
		planId: before.planId,
		version: before.version,
	});
	const label = `${before.planId}${before.version ? ` v${before.version}` : ""}`;

	if (expected.stableEnts === true) {
		expect(after.entIds, `${label}: ent row ids must be unchanged`).toEqual(
			before.entIds,
		);
	} else if (Array.isArray(expected.stableEnts)) {
		for (const featureId of expected.stableEnts) {
			expect(
				after.ents[featureId]?.id,
				`${label}: ${featureId} ent row must be unchanged`,
			).toBe(before.ents[featureId]?.id);
		}
	}

	if (expected.stableFeaturePrices) {
		expect(
			after.featurePriceIds,
			`${label}: feature price row ids must be unchanged`,
		).toEqual(before.featurePriceIds);
	}

	if (expected.stableBase) {
		expect(
			after.basePriceId,
			`${label}: base price row must be unchanged`,
		).toBe(before.basePriceId);
	}

	for (const minted of expected.mintedEnts ?? []) {
		const oldId = before.ents[minted.featureId]?.id;
		const match = (after.entsByFeature[minted.featureId] ?? []).find(
			(ent) => ent.id !== oldId && ent.allowance === minted.allowance,
		);
		expect(
			match,
			`${label}: expected a new ${minted.featureId} ent with allowance ${minted.allowance}`,
		).toBeDefined();
	}

	if (expected.mintedBase) {
		const match = after.basePrices.find(
			(price) =>
				price.id !== before.basePriceId &&
				price.amount === expected.mintedBase?.amount,
		);
		expect(
			match,
			`${label}: expected a new base price with amount ${expected.mintedBase.amount}`,
		).toBeDefined();
	}

	for (const featureId of expected.absentFeatures ?? []) {
		expect(
			after.ents[featureId],
			`${label}: ${featureId} ent must be gone from the plan definition`,
		).toBeUndefined();
	}

	for (const entId of expected.deletedEnts ?? []) {
		expect(
			await fetchEntRow({ ctx, entId }),
			`${label}: ent ${entId} must be hard-deleted`,
		).toBeNull();
	}

	for (const entId of expected.retiredEnts ?? []) {
		const row = await fetchEntRow({ ctx, entId });
		expect(row, `${label}: ent ${entId} must be retired, not deleted`).toBeTruthy();
		expect(
			row?.is_custom,
			`${label}: retired ent ${entId} must be stamped is_custom`,
		).toBe(true);
	}

	for (const priceId of expected.deletedPrices ?? []) {
		expect(
			await fetchPriceRow({ ctx, priceId }),
			`${label}: price ${priceId} must be hard-deleted`,
		).toBeNull();
	}

	for (const priceId of expected.retiredPrices ?? []) {
		const row = await fetchPriceRow({ ctx, priceId });
		expect(
			row,
			`${label}: price ${priceId} must be retired, not deleted`,
		).toBeTruthy();
		expect(
			row?.is_custom,
			`${label}: retired price ${priceId} must be stamped is_custom`,
		).toBe(true);
	}

	for (const entitlementId of expected.survivingCusEnts ?? []) {
		const [cusEnt] = await ctx.db
			.select()
			.from(customerEntitlements)
			.where(eq(customerEntitlements.entitlement_id, entitlementId))
			.limit(1);
		expect(
			cusEnt,
			`${label}: cus_ent referencing ${entitlementId} must survive`,
		).toBeDefined();
	}

	for (const priceId of expected.survivingCusPrices ?? []) {
		const [cusPrice] = await ctx.db
			.select()
			.from(customerPrices)
			.where(eq(customerPrices.price_id, priceId))
			.limit(1);
		expect(
			cusPrice,
			`${label}: cus_price referencing ${priceId} must survive`,
		).toBeDefined();
	}

	if (expected.noCustomStamps) {
		const entRows = await ctx.db
			.select()
			.from(entitlements)
			.where(eq(entitlements.internal_product_id, before.internalProductId));
		for (const row of entRows) {
			expect(
				row.is_custom,
				`${label}: ent ${row.id} must not be stamped is_custom`,
			).toBe(false);
		}
		const priceRows = await ctx.db
			.select()
			.from(prices)
			.where(eq(prices.internal_product_id, before.internalProductId));
		for (const row of priceRows) {
			expect(
				row.is_custom,
				`${label}: price ${row.id} must not be stamped is_custom`,
			).toBe(false);
		}
	}
};

export const expectPlanRowIdsReminted = ({
	from,
	to,
}: {
	from: PlanRowsSnapshot;
	to: PlanRowsSnapshot;
}) => {
	const label = `${to.planId} v${to.version ?? "?"} vs v${from.version ?? "?"}`;
	expect(
		to.internalProductId,
		`${label}: products.internal_id must be new`,
	).not.toBe(from.internalProductId);

	for (const entId of to.entIds) {
		expect(from.entIds, `${label}: ent ${entId} must be a new row`).not.toContain(
			entId,
		);
	}
	for (const priceId of to.featurePriceIds) {
		expect(
			from.featurePriceIds,
			`${label}: feature price ${priceId} must be a new row`,
		).not.toContain(priceId);
	}
	if (to.basePriceId && from.basePriceId) {
		expect(
			to.basePriceId,
			`${label}: base price row must be new`,
		).not.toBe(from.basePriceId);
	}
};
