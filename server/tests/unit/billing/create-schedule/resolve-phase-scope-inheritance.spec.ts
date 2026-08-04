import { describe, expect, test } from "bun:test";
import type {
	Entity,
	FullProduct,
	MultiAttachProductContext,
} from "@autumn/shared";
import chalk from "chalk";
import {
	buildOpeningPhaseScopes,
	resolveInheritedScope,
} from "@/internal/billing/v2/actions/createSchedule/utils/resolvePhaseScopeInheritance";

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

const openingPlan = ({
	id,
	group,
	isAddOn,
	scope,
}: {
	id: string;
	group?: string;
	isAddOn?: boolean;
	scope?: Entity;
}) =>
	({
		fullProduct: product({ id, group, isAddOn }),
		fullCustomer: { entity: scope },
	}) as unknown as MultiAttachProductContext;

describe(chalk.yellowBright("create-schedule phase scope inheritance"), () => {
	test("later phases inherit the opening phase's entity for their group", () => {
		const openingPhaseScopes = buildOpeningPhaseScopes({
			productContexts: [
				openingPlan({
					id: "enterprise",
					group: "main",
					scope: entity("ent_1"),
				}),
			],
		});

		expect(
			resolveInheritedScope({
				fullProduct: product({ id: "premium", group: "main" }),
				openingPhaseScopes,
			})?.internal_id,
		).toBe("ent_1");
	});

	test("a customer-level opening plan keeps later phases customer-level", () => {
		const openingPhaseScopes = buildOpeningPhaseScopes({
			productContexts: [openingPlan({ id: "pro", group: "main" })],
		});

		expect(
			resolveInheritedScope({
				fullProduct: product({ id: "premium", group: "main" }),
				openingPhaseScopes,
				// Would otherwise leak the request scope onto a customer-level group.
				fallbackEntity: entity("ent_1"),
			}),
		).toBeUndefined();
	});

	test("an entity-scoped plan and a customer-level add-on keep separate scopes", () => {
		const openingPhaseScopes = buildOpeningPhaseScopes({
			productContexts: [
				openingPlan({
					id: "enterprise",
					group: "main",
					scope: entity("ent_1"),
				}),
				openingPlan({ id: "credits", isAddOn: true }),
			],
		});

		expect(
			resolveInheritedScope({
				fullProduct: product({ id: "enterprise", group: "main" }),
				openingPhaseScopes,
				fallbackEntity: entity("ent_1"),
			})?.internal_id,
		).toBe("ent_1");
		expect(
			resolveInheritedScope({
				fullProduct: product({ id: "credits", isAddOn: true }),
				openingPhaseScopes,
				fallbackEntity: entity("ent_1"),
			}),
		).toBeUndefined();
	});

	test("groups absent from the opening phase fall back to the request scope", () => {
		const openingPhaseScopes = buildOpeningPhaseScopes({
			productContexts: [
				openingPlan({
					id: "enterprise",
					group: "main",
					scope: entity("ent_1"),
				}),
			],
		});

		expect(
			resolveInheritedScope({
				fullProduct: product({ id: "extra", group: "other" }),
				openingPhaseScopes,
				fallbackEntity: entity("ent_2"),
			})?.internal_id,
		).toBe("ent_2");
	});

	test("ungrouped plans inherit their own scope rather than the first group match", () => {
		const openingPhaseScopes = buildOpeningPhaseScopes({
			productContexts: [
				openingPlan({ id: "growth" }),
				openingPlan({ id: "starter", scope: entity("ent_1") }),
			],
		});

		expect(
			resolveInheritedScope({
				fullProduct: product({ id: "starter" }),
				openingPhaseScopes,
			})?.internal_id,
		).toBe("ent_1");
		expect(
			resolveInheritedScope({
				fullProduct: product({ id: "growth" }),
				openingPhaseScopes,
				fallbackEntity: entity("ent_1"),
			}),
		).toBeUndefined();
	});

	test("the first plan wins when one group spans several scopes", () => {
		const openingPhaseScopes = buildOpeningPhaseScopes({
			productContexts: [
				openingPlan({ id: "pro", group: "main", scope: entity("ent_1") }),
				openingPlan({ id: "pro", group: "main", scope: entity("ent_2") }),
			],
		});

		expect(
			resolveInheritedScope({
				fullProduct: product({ id: "premium", group: "main" }),
				openingPhaseScopes,
			})?.internal_id,
		).toBe("ent_1");
	});
});
