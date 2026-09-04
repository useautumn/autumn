import { expect, test } from "bun:test";
import {
	type ApiPlanItemV1,
	type ApiPlanV1,
	BillingInterval,
	FreeTrialDuration,
	type FullPlanLicense,
	type FullProduct,
	ResetInterval,
} from "@autumn/shared";
import { products } from "@tests/utils/fixtures/db/products";
import {
	buildPlanChange,
	buildPlanChangeCore,
	buildPlanItemChangesFromLists,
} from "@/internal/catalogV2/actions/buildPlanChange/index.js";

const plan = (overrides: Partial<ApiPlanV1> = {}): ApiPlanV1 =>
	({
		id: "pro",
		name: "Pro",
		description: null,
		group: null,
		version: 1,
		add_on: false,
		auto_enable: false,
		price: null,
		items: [],
		created_at: 1,
		env: "sandbox",
		archived: false,
		base_variant_id: null,
		base_internal_product_id: null,
		config: { ignore_past_due: false },
		billing_controls: {},
		metadata: {},
		...overrides,
	}) as ApiPlanV1;

const messagesItem = ({
	included = 100,
}: {
	included?: number;
} = {}): ApiPlanItemV1 =>
	({
		feature_id: "messages",
		included,
		unlimited: false,
		reset: { interval: ResetInterval.Month },
		price: null,
	}) as ApiPlanItemV1;

const seatsItem = (): ApiPlanItemV1 =>
	({
		feature_id: "seats",
		included: 5,
		unlimited: false,
		reset: null,
		price: null,
	}) as ApiPlanItemV1;

const monthPrice = (amount: number) => ({
	amount,
	interval: BillingInterval.Month,
});

const trial = ({
	duration_length = 14,
}: {
	duration_length?: number;
} = {}) => ({
	duration_length,
	duration_type: FreeTrialDuration.Day,
	card_required: true,
});

test("name-only change returns previous_attributes", () => {
	const change = buildPlanChangeCore({
		from: plan({ name: "Pro" }),
		to: plan({ name: "Pro Plus" }),
	});

	expect(change).toMatchObject({
		previous_attributes: { name: "Pro" },
		item_changes: [],
	});
	expect(change?.price_change).toBeUndefined();
	expect(change?.free_trial_change).toBeUndefined();
	expect(change?.plan).toBeUndefined();
});

test("price add/change/remove", () => {
	const added = buildPlanChangeCore({
		from: plan({ price: null }),
		to: plan({ price: monthPrice(10) }),
	});
	expect(added?.price_change).toEqual({
		previous: null,
		current: monthPrice(10),
	});
	expect(added?.previous_attributes).toBeNull();

	const changed = buildPlanChangeCore({
		from: plan({ price: monthPrice(10) }),
		to: plan({ price: monthPrice(20) }),
	});
	expect(changed?.price_change).toEqual({
		previous: monthPrice(10),
		current: monthPrice(20),
	});

	const removed = buildPlanChangeCore({
		from: plan({ price: monthPrice(10) }),
		to: plan({ price: null }),
	});
	expect(removed?.price_change).toEqual({
		previous: monthPrice(10),
		current: null,
	});
});

test("item add/remove", () => {
	const from = plan({ items: [messagesItem()] });
	const to = plan({ items: [seatsItem()] });

	const change = buildPlanChangeCore({ from, to });

	expect(change?.item_changes.map((c) => c.action)).toEqual([
		"deleted",
		"created",
	]);
	expect(change?.item_changes[0]).toMatchObject({
		action: "deleted",
		feature_id: "messages",
		item: messagesItem(),
	});
	expect(change?.item_changes[1]).toMatchObject({
		action: "created",
		feature_id: "seats",
		item: seatsItem(),
	});
	expect(change?.previous_attributes).toBeNull();
	expect(change?.price_change).toBeUndefined();
});

test("trial add/change/remove", () => {
	const added = buildPlanChangeCore({
		from: plan(),
		to: plan({ free_trial: trial() }),
	});
	expect(added?.free_trial_change).toEqual({
		previous: null,
		current: trial(),
	});
	expect(added?.previous_attributes).toMatchObject({ free_trial: null });

	const changed = buildPlanChangeCore({
		from: plan({ free_trial: trial({ duration_length: 7 }) }),
		to: plan({ free_trial: trial({ duration_length: 14 }) }),
	});
	expect(changed?.free_trial_change).toEqual({
		previous: trial({ duration_length: 7 }),
		current: trial({ duration_length: 14 }),
	});

	const removed = buildPlanChangeCore({
		from: plan({ free_trial: trial() }),
		to: plan({ free_trial: undefined }),
	});
	expect(removed?.free_trial_change).toEqual({
		previous: trial(),
		current: null,
	});
});

test("no-op returns undefined", () => {
	const base = plan({
		price: monthPrice(10),
		items: [messagesItem()],
		free_trial: trial(),
	});

	expect(buildPlanChangeCore({ from: base, to: { ...base } })).toBeUndefined();
});

test("missing from or to returns undefined", () => {
	expect(buildPlanChangeCore({ from: undefined, to: plan() })).toBeUndefined();
	expect(buildPlanChangeCore({ from: plan(), to: undefined })).toBeUndefined();
	expect(buildPlanChangeCore({})).toBeUndefined();
	expect(buildPlanChange({})).toBeUndefined();
});

test("price change includes customize lane", () => {
	const change = buildPlanChangeCore({
		from: plan({ price: null }),
		to: plan({ price: monthPrice(10) }),
	});

	expect(change?.customize).toEqual({ price: monthPrice(10) });
});

test("buildPlanItemChangesFromLists assembles explicit created/deleted", () => {
	const created = [seatsItem()];
	const deleted = [messagesItem()];

	expect(
		buildPlanItemChangesFromLists({
			createdItems: created,
			deletedItems: deleted,
		}),
	).toEqual([
		{
			action: "deleted",
			feature_id: "messages",
			item: messagesItem(),
		},
		{
			action: "created",
			feature_id: "seats",
			item: seatsItem(),
		},
	]);
});

const parentProduct = ({ name = "Pro" }: { name?: string } = {}): FullProduct =>
	products.createFull({ id: "pro", name });

const seatProduct = ({
	version = 1,
	name = "Seat",
}: {
	version?: number;
	name?: string;
} = {}): FullProduct => ({
	...products.createFull({ id: "seat", name }),
	version,
});

const planLicense = ({
	parent,
	licenseProduct,
	included = 3,
	prepaidOnly = true,
}: {
	parent: FullProduct;
	licenseProduct: FullProduct;
	included?: number;
	prepaidOnly?: boolean;
}): FullPlanLicense => ({
	id: `license_${licenseProduct.id}`,
	parent_internal_product_id: parent.internal_id,
	is_custom: false,
	license_internal_product_id: licenseProduct.internal_id,
	included,
	prepaid_only: prepaidOnly,
	customized: false,
	metadata: null,
	created_at: 1,
	updated_at: 1,
	product: licenseProduct,
});

const withLicenses = ({
	parent,
	licenses,
}: {
	parent: FullProduct;
	licenses: FullPlanLicense[];
}): FullProduct => ({ ...parent, licenses });

test("license create: null previous_attributes, upsert_licenses, no nested plan_change", () => {
	const parent = parentProduct();
	const seat = seatProduct();
	const change = buildPlanChange({
		from: parent,
		to: withLicenses({
			parent,
			licenses: [planLicense({ parent, licenseProduct: seat, included: 3 })],
		}),
	});

	expect(change?.license_changes).toMatchObject([
		{
			action: "created",
			license_plan_id: "seat",
			included: 3,
			previous_attributes: null,
		},
	]);
	expect(change?.license_changes?.[0]?.plan_change).toBeUndefined();
	expect(change?.customize?.upsert_licenses).toMatchObject([
		{ license_plan_id: "seat", included: 3 },
	]);
	expect(change?.customize?.remove_licenses).toBeUndefined();
});

test("license remove: snapshot of dropped row, remove_licenses", () => {
	const parent = parentProduct();
	const seat = seatProduct();
	const change = buildPlanChange({
		from: withLicenses({
			parent,
			licenses: [planLicense({ parent, licenseProduct: seat, included: 5 })],
		}),
		to: parent,
	});

	expect(change?.license_changes).toMatchObject([
		{
			action: "removed",
			license_plan_id: "seat",
			included: 5,
			previous_attributes: null,
		},
	]);
	expect(change?.customize?.remove_licenses).toEqual([
		{ license_plan_id: "seat" },
	]);
	expect(change?.customize?.upsert_licenses).toBeUndefined();
});

test("license update included only: previous_attributes, no nested plan_change", () => {
	const parent = parentProduct();
	const seat = seatProduct();
	const change = buildPlanChange({
		from: withLicenses({
			parent,
			licenses: [planLicense({ parent, licenseProduct: seat, included: 5 })],
		}),
		to: withLicenses({
			parent,
			licenses: [planLicense({ parent, licenseProduct: seat, included: 3 })],
		}),
	});

	expect(change?.license_changes).toMatchObject([
		{
			action: "updated",
			included: 3,
			previous_attributes: { included: 5 },
		},
	]);
	expect(change?.license_changes?.[0]?.plan_change).toBeUndefined();
	expect(change?.customize?.upsert_licenses).toMatchObject([
		{ license_plan_id: "seat", included: 3 },
	]);
});

test("license-only change still emits when plan content is unchanged", () => {
	const parent = parentProduct({ name: "Pro" });
	const seat = seatProduct();
	const change = buildPlanChange({
		from: parent,
		to: withLicenses({
			parent,
			licenses: [planLicense({ parent, licenseProduct: seat })],
		}),
	});

	expect(change).toBeDefined();
	expect(change?.previous_attributes).toBeNull();
	expect(change?.license_changes).toHaveLength(1);
});

test("identical FullProducts including licenses is a no-op", () => {
	const parent = parentProduct();
	const seat = seatProduct();
	const licenses = [planLicense({ parent, licenseProduct: seat, included: 3 })];
	const product = withLicenses({ parent, licenses });

	expect(
		buildPlanChange({ from: product, to: { ...product } }),
	).toBeUndefined();
});

test("content + license compose onto one plan_change", () => {
	const from = parentProduct({ name: "Pro" });
	const seat = seatProduct();
	const change = buildPlanChange({
		from,
		to: withLicenses({
			parent: { ...from, name: "Pro Plus" },
			licenses: [planLicense({ parent: from, licenseProduct: seat })],
		}),
	});

	expect(change?.previous_attributes).toEqual({ name: "Pro" });
	expect(change?.license_changes).toHaveLength(1);
	expect(change?.customize?.upsert_licenses).toHaveLength(1);
});

test("license product content change: nested core plan_change", () => {
	const parent = parentProduct();
	const fromSeat = seatProduct({ name: "Seat" });
	const toSeat = { ...fromSeat, name: "Seat Plus" };
	const change = buildPlanChange({
		from: withLicenses({
			parent,
			licenses: [
				planLicense({ parent, licenseProduct: fromSeat, included: 3 }),
			],
		}),
		to: withLicenses({
			parent,
			licenses: [planLicense({ parent, licenseProduct: toSeat, included: 3 })],
		}),
	});

	expect(change?.license_changes).toMatchObject([
		{
			action: "updated",
			previous_attributes: null,
			plan_change: { previous_attributes: { name: "Seat" } },
		},
	]);
});
