/**
 * S4a contract (PRD §8 B and C): `entity` is null at the customer level and the
 * entity's type otherwise; `billing_cycle_anchor` is now / unchanged / custom.
 *
 * Red (before):  billing change facts and fields have no entity or anchor.
 * Green (after): the PRD rules match exactly the attaches they should block.
 */

import { describe, expect, test } from "bun:test";
import {
	type BillingChangeFacts,
	matchRuleFilter,
} from "@autumn/shared/api/approvals/evaluate/index.js";
import { rules } from "@tests/utils/fixtures/rules.js";
import { facts } from "./utils/facts.js";
import { matchContext } from "./utils/matchContext.js";

const attach = ({
	rule,
	planId,
	entity,
}: {
	rule: ReturnType<typeof rules.block>;
	planId: string;
	entity: BillingChangeFacts["entity"];
}) =>
	matchRuleFilter({
		rule,
		action: "billing.attach",
		facts: facts.billingChange({
			entity,
			incoming: [facts.incomingPlan({ planId })],
		}),
		context: matchContext,
	});

describe("entity and billing cycle anchor", () => {
	test("PRD B: credit add-ons on an entity match; on the customer they don't", () => {
		const rule = rules.creditAddonsOnCustomer();

		expect(
			attach({
				rule,
				planId: "credits_addon",
				entity: facts.entity({ featureId: "deployments" }),
			}),
		).toEqual({
			matches: true,
			conditions: [
				{
					field: "incoming[0].plan_id",
					label: "Incoming plan",
					limit: "credits_addon",
					actual: "credits_addon",
				},
				{
					field: "entity",
					label: "Entity",
					limit: "any",
					actual: "deployments",
				},
			],
		});
		expect(
			attach({ rule, planId: "credits_addon", entity: null }).matches,
		).toBe(false);
	});

	test("PRD C: Pro on the customer or on another entity type matches; on a deployment it doesn't", () => {
		const rule = rules.plansOnDeployments();

		expect(attach({ rule, planId: "pro", entity: null }).conditions).toEqual([
			{
				field: "incoming[0].plan_id",
				label: "Incoming plan",
				limit: "pro or enterprise or hobby",
				actual: "pro",
			},
			{ field: "entity", label: "Entity", limit: "none", actual: "none" },
		]);
		expect(
			attach({
				rule,
				planId: "pro",
				entity: facts.entity({ featureId: "seats" }),
			}).conditions,
		).toEqual([
			{
				field: "incoming[0].plan_id",
				label: "Incoming plan",
				limit: "pro or enterprise or hobby",
				actual: "pro",
			},
			{
				field: "entity.feature_id",
				label: "Entity type",
				limit: "not deployments",
				actual: "seats",
			},
		]);
		expect(
			attach({
				rule,
				planId: "pro",
				entity: facts.entity({ featureId: "deployments" }),
			}).matches,
		).toBe(false);
		expect(
			attach({ rule, planId: "credits_addon", entity: null }).matches,
		).toBe(false);
	});

	test("a billing cycle anchor block matches only the anchors it names", () => {
		const resetCycle = ({
			anchor,
		}: {
			anchor: BillingChangeFacts["billing_cycle_anchor"];
		}) =>
			matchRuleFilter({
				rule: rules.block({
					actions: ["billing.update"],
					filter: { billing_cycle_anchor: { $in: ["now", "custom"] } },
				}),
				action: "billing.update",
				facts: facts.billingChange({ billing_cycle_anchor: anchor }),
				context: matchContext,
			});

		expect(resetCycle({ anchor: "now" })).toEqual({
			matches: true,
			conditions: [
				{
					field: "billing_cycle_anchor",
					label: "Billing cycle",
					limit: "now or custom",
					actual: "now",
				},
			],
		});
		expect(resetCycle({ anchor: "custom" }).matches).toBe(true);
		expect(resetCycle({ anchor: "unchanged" }).matches).toBe(false);
	});
});
