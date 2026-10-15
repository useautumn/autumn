import { AppEnv } from "../../../models/genModels/genEnums";
import type { ApprovalAction } from "../actions/approvalActions";
import type { ApprovalRule } from "../schemas/approvalRule";
import { buildDenyMessage } from "./buildDenyMessage";
import type { ApprovalFactsFor } from "./facts/approvalFacts";
import { findRuleFailures } from "./findRuleFailures";
import { findDecidingLevel } from "./levels/findDecidingLevel";
import { listAllowedRoles } from "./listAllowedRoles";
import {
	type ApprovalPrincipal,
	EXEMPT_ROLES,
} from "./types/approvalPrincipal";
import type { ApprovalVerdict } from "./types/approvalVerdict";

const SCOPES_FALLBACK: ApprovalVerdict = {
	verdict: "fallback",
	fallback: "scopes",
};

/**
 * Checks a principal's request against the org's approval rules. Pure: facts
 * come from the caller. The most specific level with an enabled rule for the
 * action decides; with none, the caller keeps today's scope check.
 */
export const evaluateApprovalRules = <Action extends ApprovalAction>({
	principal,
	action,
	facts,
	rules,
	env,
	now = Date.now(),
}: {
	principal: ApprovalPrincipal;
	action: Action;
	facts: ApprovalFactsFor<Action>;
	rules: ApprovalRule[];
	env: AppEnv;
	/** Unix ms that relative dates (`{ days_from_now }`) resolve against. */
	now?: number;
}): ApprovalVerdict => {
	if (principal.type === "api_key") return SCOPES_FALLBACK;

	const isExempt = env !== AppEnv.Live || EXEMPT_ROLES.includes(principal.role);
	if (isExempt) return { verdict: "allow", decided_by: null };

	const actionRules = rules.filter(
		(rule) => rule.enabled && rule.actions.includes(action),
	);
	const decidingLevel = findDecidingLevel({ principal, rules: actionRules });
	if (!decidingLevel) return SCOPES_FALLBACK;

	const context = { principal, now: new Date(now) };
	const results = decidingLevel.rules.map((rule) => ({
		rule,
		failures: findRuleFailures({ rule, action, facts, context }),
	}));
	const decidedBy = ({ rule }: { rule: ApprovalRule }) => ({
		level: decidingLevel.level,
		rule_id: rule.id,
		rule_name: rule.name,
	});

	const matched = results.find(({ failures }) => failures.length === 0);
	if (matched) return { verdict: "allow", decided_by: decidedBy(matched) };

	// Explain the rule the request came closest to; ties go to the first rule.
	const closest = results.reduce((best, result) =>
		result.failures.length < best.failures.length ? result : best,
	);
	return {
		verdict: "deny",
		violations: closest.failures,
		decided_by: decidedBy(closest),
		allowed_roles: listAllowedRoles({
			rules: actionRules,
			action,
			facts,
			context,
		}),
		message:
			closest.rule.note ||
			buildDenyMessage({
				ruleName: closest.rule.name,
				violations: closest.failures,
			}),
	};
};
