import { describe, expect, test } from "bun:test";
import { type ApiPlanV1, diffPlanV1 } from "@autumn/shared";

const plan = (overrides: Partial<ApiPlanV1>): ApiPlanV1 =>
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
		config: { ignore_past_due: false },
		billing_controls: {},
		metadata: {},
		...overrides,
	}) as ApiPlanV1;

const planWithLicenses = (licenses: ApiPlanV1["licenses"]) =>
	plan({ licenses });

const devSeat = (customize: unknown) =>
	[
		{ license_plan_id: "dev_seat", customize },
	] as unknown as ApiPlanV1["licenses"];

describe("diffPlanV1 upsert_licenses", () => {
	test("emits the customize when a link gains an item", () => {
		const from = planWithLicenses(devSeat(null));
		const to = planWithLicenses(
			devSeat({ add_items: [{ feature_id: "sso" }] }),
		);

		expect(diffPlanV1({ from, to }).upsert_licenses).toEqual([
			{
				license_plan_id: "dev_seat",
				customize: { add_items: [{ feature_id: "sso" }] },
			},
		]);
	});

	test("omits upsert_licenses when the customize is unchanged", () => {
		const customize = { add_items: [{ feature_id: "sso" }] };
		const from = planWithLicenses(devSeat(customize));
		const to = planWithLicenses(devSeat({ ...customize }));

		expect(diffPlanV1({ from, to }).upsert_licenses).toBeUndefined();
	});

	test("emits a null customize when the link is cleared back to inheritance", () => {
		const from = planWithLicenses(
			devSeat({ add_items: [{ feature_id: "sso" }] }),
		);
		const to = planWithLicenses(devSeat(null));

		expect(diffPlanV1({ from, to }).upsert_licenses).toEqual([
			{ license_plan_id: "dev_seat", customize: null },
		]);
	});

	test("ignores link lifecycle: added and removed links produce no entry", () => {
		const linked = planWithLicenses(
			devSeat({ add_items: [{ feature_id: "sso" }] }),
		);
		const unlinked = planWithLicenses([]);

		expect(
			diffPlanV1({ from: unlinked, to: linked }).upsert_licenses,
		).toBeUndefined();
		expect(
			diffPlanV1({ from: linked, to: unlinked }).upsert_licenses,
		).toBeUndefined();
	});
});
