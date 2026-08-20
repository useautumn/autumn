import {
	ApiVersion,
	type CusProductStatus,
	customerProducts,
	customers,
	type ProductItem,
	rollovers,
} from "@autumn/shared";
import {
	attachCustomerPaidPrice,
	readScopedFeatureRow,
	repointToCustomEntitlement,
} from "@tests/integration/billing/migrations-v2/batch-migrations/paidRowTestUtils";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import defaultCtx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import { and, eq } from "drizzle-orm";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { generateId } from "@/utils/genUtils.js";

/** How a member's plan diverges from the catalog it was attached from.
 * Absent means a plain catalog holder — the customer a migration must move.
 * Only `custom_attach` and `custom_patch` set customer_products.is_custom,
 * which is the flag plan_filter.custom actually reads. */
export type CastDivergence =
	| { kind: "custom_attach"; items: ProductItem[] }
	| { kind: "custom_patch"; addItems: ProductItem[] }
	| { kind: "custom_definition"; featureId: string; allowance?: number }
	| { kind: "paid_row"; featureId: string }
	| { kind: "rollover"; featureId: string; balance: number; usage?: number };

export type CastMember = {
	/** Suffixes the customer id and labels the member in the briefing. */
	role: string;
	/** Catalog version to attach from; defaults to the latest. */
	version?: number;
	divergence?: CastDivergence;
	/** Seats bought on the linked license plan, and how many get assigned. */
	seats?: { attached: number; assigned: number };
	usage?: { featureId: string; value: number }[];
	/** Forced onto the plan row after attach, for lifecycle coverage. */
	status?: CusProductStatus;
	/** Leaves the customer with no parent plan at all. */
	unattached?: boolean;
	note?: string;
};

export type LicensePlanSpec = {
	/** One item set per version; index 0 is v1, later ones are minted. */
	versions: ProductItem[][];
	includedSeats: number;
};

export type SeededMember = CastMember & { customerId: string };

const PAID_TEMPLATE_ID = "paid-template";

const needsPaidTemplate = (members: CastMember[]) =>
	members.some((member) => member.divergence?.kind === "paid_row");

export type SeedMigrationCastParams = {
	idPrefix: string;
	/** One item set per parent-plan version; index 0 is v1. */
	planVersions: ProductItem[][];
	licensePlan?: LicensePlanSpec;
	members: CastMember[];
};

/** Re-reads an already-seeded cast without touching it, so a scenario file can
 * print state after you have driven the migration yourself. */
const resolveSeededCast = ({
	idPrefix,
	planVersions,
	licensePlan,
	members,
}: SeedMigrationCastParams) => {
	const ctx = defaultCtx;
	const client = (version: ApiVersion) =>
		new AutumnInt({ version, secretKey: ctx.orgSecretKey });

	return {
		ctx,
		autumnV1: client(ApiVersion.V1_2),
		autumnV2_2: client(ApiVersion.V2_2),
		autumnV2_3: client(ApiVersion.V2_3),
		idPrefix,
		parent: { id: `parent_${idPrefix}` },
		seat: licensePlan ? { id: `seat_${idPrefix}` } : undefined,
		paidTemplate: needsPaidTemplate(members)
			? { id: `${PAID_TEMPLATE_ID}_${idPrefix}` }
			: undefined,
		members: members.map((member) => ({
			...member,
			customerId: `${idPrefix}-${member.role}`,
		})),
		versionCount: planVersions.length,
	};
};

/**
 * Seeds one parent plan (optionally linked to a license plan), mints every
 * requested catalog version, then puts each cast member into its declared state.
 * Re-running deletes the whole cast first, so a scenario always resets clean.
 * `SEED=0` skips all of that and just re-reads what is already there.
 */
export const seedMigrationCast = async (params: SeedMigrationCastParams) => {
	if (process.env.SEED === "0") return resolveSeededCast(params);

	const { idPrefix, planVersions, licensePlan, members } = params;
	const [firstVersion] = planVersions;
	// Plans are created bare: the V1_2 create route silently strips v2 item
	// shapes, so every version is set through the v2_3 route instead.
	const parent = products.base({ id: "parent", items: [] });
	const seat = licensePlan
		? products.base({
				id: "seat",
				items: [],
				group: `${idPrefix}-seat-licenses`,
			})
		: undefined;
	const paidTemplate = needsPaidTemplate(members)
		? products.base({
				id: PAID_TEMPLATE_ID,
				items: [items.consumableMessages()],
			})
		: undefined;

	const seeded: SeededMember[] = members.map((member) => ({
		...member,
		customerId: `${idPrefix}-${member.role}`,
	}));
	const [primary, ...others] = seeded;

	const scenario = await initScenario({
		customerId: primary.customerId,
		setup: [
			s.customer({ testClock: false }),
			s.otherCustomers(others.map(({ customerId }) => ({ id: customerId }))),
			s.products({
				list: [
					parent,
					...(seat ? [seat] : []),
					...(paidTemplate ? [paidTemplate] : []),
				],
				prefix: idPrefix,
			}),
		],
		actions: [],
	});
	const { ctx, autumnV1, autumnV2_2, autumnV2_3 } = scenario;

	await autumnV2_3.post("/plans.update", {
		plan_id: parent.id,
		items: firstVersion,
	});

	// Linking before minting means every later version inherits the link.
	if (seat && licensePlan) {
		await autumnV2_3.post("/plans.update", {
			plan_id: seat.id,
			items: licensePlan.versions[0],
		});
		await autumnV2_3.post("/plans.update", {
			plan_id: parent.id,
			licenses: [
				{ license_plan_id: seat.id, included: licensePlan.includedSeats },
			],
		});
		for (const seatItems of licensePlan.versions.slice(1)) {
			await autumnV2_3.post("/plans.update", {
				plan_id: seat.id,
				force_version: true,
				items: seatItems,
			});
		}
	}

	const attachMember = async (member: SeededMember) => {
		if (member.unattached) return;
		await autumnV2_3.billing.attach({
			customer_id: member.customerId,
			plan_id: parent.id,
			...(member.divergence?.kind === "custom_attach"
				? { items: member.divergence.items }
				: {}),
			...(seat && member.seats
				? {
						license_quantities: [
							{ license_plan_id: seat.id, quantity: member.seats.attached },
						],
					}
				: {}),
		});

		if (seat && member.seats?.assigned) {
			await autumnV2_3.licenses.attach({
				customer_id: member.customerId,
				plan_id: seat.id,
				entities: Array.from({ length: member.seats.assigned }, (_, index) => ({
					entity_id: `${member.customerId}-seat-${index + 1}`,
					name: `Seat ${index + 1}`,
					feature_id: TestFeature.Users,
				})),
			});
		}
	};

	// Attaching a member while its version is still the latest is what lets a
	// custom attach pin a version — `items` and `version` together are ignored.
	for (let version = 1; version <= planVersions.length; version++) {
		if (version > 1) {
			await autumnV2_3.post("/plans.update", {
				plan_id: parent.id,
				force_version: true,
				items: planVersions[version - 1],
			});
		}
		for (const member of seeded) {
			if ((member.version ?? planVersions.length) !== version) continue;
			await attachMember(member);
		}
	}

	for (const member of seeded) {
		const { divergence } = member;
		if (!divergence) continue;

		if (divergence.kind === "custom_patch") {
			await autumnV2_2.post("/subscriptions.update", {
				customer_id: member.customerId,
				plan_id: parent.id,
				customize: { add_items: divergence.addItems },
			});
		}

		if (divergence.kind === "custom_definition") {
			await repointToCustomEntitlement({
				ctx,
				customerId: member.customerId,
				featureId: divergence.featureId,
				overrides:
					divergence.allowance === undefined
						? {}
						: { allowance: divergence.allowance },
			});
		}

		if (divergence.kind === "paid_row") {
			if (!paidTemplate) throw new Error("expected a paid template plan");
			await attachCustomerPaidPrice({
				ctx,
				customerId: member.customerId,
				featureId: divergence.featureId,
				templatePlanId: paidTemplate.id,
			});
		}

		if (divergence.kind === "rollover") {
			const row = await readScopedFeatureRow({
				ctx,
				customerId: member.customerId,
				featureId: divergence.featureId,
			});
			await ctx.db.insert(rollovers).values({
				id: generateId("ro"),
				cus_ent_id: row.id,
				balance: divergence.balance,
				expires_at: null,
				usage: divergence.usage ?? 0,
				entities: {},
			});
		}
	}

	for (const member of seeded) {
		if (!member.status) continue;
		const rows = await ctx.db
			.select({ id: customerProducts.id })
			.from(customerProducts)
			.innerJoin(
				customers,
				eq(customerProducts.internal_customer_id, customers.internal_id),
			)
			.where(
				and(
					eq(customers.org_id, ctx.org.id),
					eq(customers.env, ctx.env),
					eq(customers.id, member.customerId),
					eq(customerProducts.product_id, parent.id),
				),
			);
		for (const { id } of rows) {
			await ctx.db
				.update(customerProducts)
				.set({ status: member.status })
				.where(eq(customerProducts.id, id));
		}
	}

	for (const member of seeded) {
		for (const { featureId, value } of member.usage ?? []) {
			await autumnV1.track({
				customer_id: member.customerId,
				feature_id: featureId,
				value,
			});
		}
	}
	if (seeded.some((member) => member.usage?.length)) {
		await new Promise((resolve) => setTimeout(resolve, 3000));
	}

	return {
		ctx,
		autumnV1,
		autumnV2_2,
		autumnV2_3,
		idPrefix,
		parent: { id: parent.id },
		seat: seat ? { id: seat.id } : undefined,
		paidTemplate: paidTemplate ? { id: paidTemplate.id } : undefined,
		members: seeded,
		versionCount: planVersions.length,
	};
};

export type SeededCast = Awaited<ReturnType<typeof seedMigrationCast>>;
