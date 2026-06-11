import {
	type AgentRules,
	defaultAgentRules,
	type EntityRules,
} from "@autumn/shared";

export const entityRules = ({
	attachToEntities = false,
	entityFeatureId = "",
}: {
	attachToEntities?: boolean;
	entityFeatureId?: string;
} = {}): EntityRules => ({
	attach_to_entities: attachToEntities,
	entity_feature_id: entityFeatureId,
});

export const notes = ({ value = "" }: { value?: string } = {}) => value;

const base = ({
	entityRules: entityRuleOverrides,
	notes: ruleNotes = "",
}: {
	entityRules?: EntityRules;
	notes?: string;
} = {}): AgentRules => ({
	...defaultAgentRules(),
	...(entityRuleOverrides ? { entity_rules: entityRuleOverrides } : {}),
	notes: ruleNotes,
});

export const agentRules = {
	base,
	entityRules,
	notes,
} as const;
