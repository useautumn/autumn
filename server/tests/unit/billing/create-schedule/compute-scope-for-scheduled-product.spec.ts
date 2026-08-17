import { describe, expect, test } from "bun:test";
import type {
	Entity,
	FullProduct,
	MultiAttachProductContext,
} from "@autumn/shared";
import chalk from "chalk";
import { computeScopeForScheduledProduct } from "@/internal/billing/v2/actions/createSchedule/utils/computeScopeForScheduledProduct";

// prices: [] keeps isOneOffProduct's price scan from tripping on a bare stub.
const product = ({
	id,
	group,
	isAddOn = false,
}: {
	id: string;
	group?: string;
	isAddOn?: boolean;
}) =>
	({
		id,
		group,
		is_add_on: isAddOn,
		prices: [],
	}) as unknown as FullProduct;

const entity = (internalId: string) =>
	({ internal_id: internalId, id: internalId }) as unknown as Entity;

const immediatePlan = ({
	id,
	group,
	isAddOn,
	scope,
	unscheduled = false,
}: {
	id: string;
	group?: string;
	isAddOn?: boolean;
	scope?: Entity;
	unscheduled?: boolean;
}) =>
	({
		fullProduct: product({ id, group, isAddOn }),
		fullCustomer: { entity: scope },
		unscheduled,
	}) as unknown as MultiAttachProductContext;

describe(chalk.yellowBright("computeScopeForScheduledProduct"), () => {
	test("later phases inherit the immediate phase's entity for their slot", () => {
		expect(
			computeScopeForScheduledProduct({
				fullProduct: product({ id: "premium", group: "main" }),
				immediatePhaseProductContexts: [
					immediatePlan({
						id: "enterprise",
						group: "main",
						scope: entity("ent_1"),
					}),
				],
			})?.internal_id,
		).toBe("ent_1");
	});

	test("a customer-level immediate plan keeps later phases customer-level", () => {
		expect(
			computeScopeForScheduledProduct({
				fullProduct: product({ id: "premium", group: "main" }),
				immediatePhaseProductContexts: [
					immediatePlan({ id: "pro", group: "main" }),
				],
				// Would otherwise leak the request scope onto a customer-level slot.
				fallbackEntity: entity("ent_1"),
			}),
		).toBeUndefined();
	});

	test("an entity-scoped plan and a customer-level add-on keep separate scopes", () => {
		const immediatePhaseProductContexts = [
			immediatePlan({
				id: "enterprise",
				group: "main",
				scope: entity("ent_1"),
			}),
			immediatePlan({ id: "credits", isAddOn: true }),
		];

		expect(
			computeScopeForScheduledProduct({
				fullProduct: product({ id: "enterprise", group: "main" }),
				immediatePhaseProductContexts,
				fallbackEntity: entity("ent_1"),
			})?.internal_id,
		).toBe("ent_1");
		expect(
			computeScopeForScheduledProduct({
				fullProduct: product({ id: "credits", isAddOn: true }),
				immediatePhaseProductContexts,
				fallbackEntity: entity("ent_1"),
			}),
		).toBeUndefined();
	});

	test("slots absent from the immediate phase fall back to the request scope", () => {
		expect(
			computeScopeForScheduledProduct({
				fullProduct: product({ id: "extra", group: "other" }),
				immediatePhaseProductContexts: [
					immediatePlan({
						id: "enterprise",
						group: "main",
						scope: entity("ent_1"),
					}),
				],
				fallbackEntity: entity("ent_2"),
			})?.internal_id,
		).toBe("ent_2");
	});

	test("ungrouped plans match on their own product before the shared slot", () => {
		const immediatePhaseProductContexts = [
			immediatePlan({ id: "growth" }),
			immediatePlan({ id: "starter", scope: entity("ent_1") }),
		];

		expect(
			computeScopeForScheduledProduct({
				fullProduct: product({ id: "starter" }),
				immediatePhaseProductContexts,
			})?.internal_id,
		).toBe("ent_1");
		expect(
			computeScopeForScheduledProduct({
				fullProduct: product({ id: "growth" }),
				immediatePhaseProductContexts,
				fallbackEntity: entity("ent_1"),
			}),
		).toBeUndefined();
	});

	test("unscheduled plans are never inherited from", () => {
		expect(
			computeScopeForScheduledProduct({
				fullProduct: product({ id: "premium", group: "main" }),
				immediatePhaseProductContexts: [
					immediatePlan({
						id: "pro",
						group: "main",
						scope: entity("ent_1"),
						unscheduled: true,
					}),
				],
				fallbackEntity: entity("ent_2"),
			})?.internal_id,
		).toBe("ent_2");
	});

	test("the first plan wins when one slot spans several scopes", () => {
		expect(
			computeScopeForScheduledProduct({
				fullProduct: product({ id: "premium", group: "main" }),
				immediatePhaseProductContexts: [
					immediatePlan({ id: "pro", group: "main", scope: entity("ent_1") }),
					immediatePlan({ id: "pro", group: "main", scope: entity("ent_2") }),
				],
			})?.internal_id,
		).toBe("ent_1");
	});
});
