import type { AgentRules, Feature } from "@autumn/shared";
import { Button, Switch, Textarea } from "@autumn/ui";
import { useStore } from "@tanstack/react-form";
import { SparklesIcon } from "lucide-react";
import { toast } from "sonner";
import { FeatureSearchDropdown } from "@/components/v2/dropdowns/FeatureSearchDropdown";
import { useAppForm } from "@/hooks/form/form";
import type {
	AgentRulesResponse,
	useAgentRulesQuery,
} from "@/hooks/queries/useAgentRulesQuery";
import { getBackendErr } from "@/utils/genUtils";
import {
	SETTINGS_LIST_CLASS,
	SettingsGroup,
} from "../../components/SettingsGroup";
import { SettingsListRow } from "../../components/SettingsListRow";

const toFormValues = (rules?: AgentRulesResponse): AgentRules => ({
	entity_rules: {
		attach_to_entities: rules?.entity_rules.attach_to_entities ?? false,
		entity_feature_id: rules?.entity_rules.entity_feature_id ?? "",
	},
	credit_rules: {
		credit_feature_id: rules?.credit_rules.credit_feature_id ?? "",
	},
	notes: rules?.notes ?? "",
});

interface AgentRulesFormProps {
	readonly agent: ReturnType<typeof useAgentRulesQuery>;
	readonly features: Feature[];
}

export const AgentRulesForm = ({ agent, features }: AgentRulesFormProps) => {
	const { rules, isLoading, generate, isGenerating, update, isUpdating } =
		agent;

	const form = useAppForm({
		defaultValues: toFormValues(rules),
		onSubmit: async ({ value }) => {
			try {
				await update(value);
				toast.success("Agent rules updated");
			} catch (error) {
				toast.error(getBackendErr(error, "Failed to update agent rules"));
			}
		},
	});

	const isDirty = useStore(form.store, (state) => state.isDirty);

	const handleGenerate = async () => {
		try {
			await generate();
			toast.success("Agent rules generated from recent usage");
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to generate agent rules"));
		}
	};

	return (
		<SettingsGroup
			title="Agent rules"
			description="What the agent should assume about your pricing when it makes changes."
			trailing={
				<div className="flex gap-2">
					<Button
						variant="secondary"
						size="sm"
						onClick={handleGenerate}
						isLoading={isGenerating}
						disabled={isLoading || isUpdating}
					>
						<SparklesIcon />
						Generate from usage
					</Button>
					{isDirty && (
						<Button
							size="sm"
							onClick={() => form.handleSubmit()}
							isLoading={isUpdating}
						>
							Save
						</Button>
					)}
				</div>
			}
		>
			<div className={SETTINGS_LIST_CLASS}>
				<SettingsListRow
					title="Attach plans to entities"
					description="Plans belong to entities like seats or workspaces, not the whole customer"
				>
					<form.AppField name="entity_rules.attach_to_entities">
						{(field) => (
							<Switch
								checked={field.state.value}
								onCheckedChange={(checked) => field.handleChange(checked)}
							/>
						)}
					</form.AppField>
				</SettingsListRow>
				<SettingsListRow
					title="Entity feature"
					description="The feature each entity is counted against"
				>
					<form.AppField name="entity_rules.entity_feature_id">
						{(field) => (
							<FeatureSearchDropdown
								features={features}
								value={field.state.value || null}
								onSelect={(featureId) => field.handleChange(featureId)}
								triggerClassName="w-[280px] !bg-background"
							/>
						)}
					</form.AppField>
				</SettingsListRow>
				<div className="flex flex-col gap-2.5 px-4 py-3.5">
					<div className="flex flex-col gap-0.5">
						<span className="font-medium text-foreground text-sm">
							Instructions
						</span>
						<span className="text-tertiary-foreground text-xs">
							Plain-language guidance the agent always follows
						</span>
					</div>
					<form.AppField name="notes">
						{(field) => (
							<Textarea
								value={field.state.value}
								onChange={(event) => field.handleChange(event.target.value)}
								placeholder="Jot your thoughts, we'll format it for you."
								className="!bg-background min-h-24"
							/>
						)}
					</form.AppField>
				</div>
			</div>
		</SettingsGroup>
	);
};
