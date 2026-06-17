import type { AgentRules, Feature } from "@autumn/shared";
import { useStore } from "@tanstack/react-form";
import { SparklesIcon } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/v2/buttons/Button";
import { Card } from "@/components/v2/cards/Card";
import { FeatureSearchDropdown } from "@/components/v2/dropdowns/FeatureSearchDropdown";
import { useAppForm } from "@/hooks/form/form";
import type {
	AgentRulesResponse,
	useAgentRulesQuery,
} from "@/hooks/queries/useAgentRulesQuery";
import { getBackendErr } from "@/utils/genUtils";
import { RuleField } from "./RuleField";
import { RuleGroup } from "./RuleGroup";

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
		<div className="flex flex-col gap-3">
			<div className="flex items-center justify-between gap-4">
				<span className="text-sm font-medium text-foreground">Agent rules</span>
				<div className="flex gap-2">
					<Button
						variant="secondary"
						size="sm"
						onClick={handleGenerate}
						isLoading={isGenerating}
						disabled={isLoading || isUpdating}
					>
						<SparklesIcon />
						Generate
					</Button>
					<Button
						variant="primary"
						size="sm"
						onClick={() => form.handleSubmit()}
						isLoading={isUpdating}
						disabled={!isDirty}
					>
						Save
					</Button>
				</div>
			</div>

			<Card className="gap-0 py-0">
				<div className="flex flex-col divide-y">
					<RuleGroup
						title="Entity rules"
						description="Whether plans attach to entities like seats or workspaces"
					>
						<RuleField label="Attach to entities">
							<form.AppField name="entity_rules.attach_to_entities">
								{(field) => (
									<Switch
										checked={field.state.value}
										onCheckedChange={(checked) => field.handleChange(checked)}
									/>
								)}
							</form.AppField>
						</RuleField>
						<RuleField label="Entity feature">
							<form.AppField name="entity_rules.entity_feature_id">
								{(field) => (
									<FeatureSearchDropdown
										features={features}
										value={field.state.value || null}
										onSelect={(featureId) => field.handleChange(featureId)}
										triggerClassName="w-56"
									/>
								)}
							</form.AppField>
						</RuleField>
					</RuleGroup>

					<div className="flex flex-col gap-2.5 px-4 py-3.5">
						<div className="flex flex-col gap-0.5">
							<span className="text-sm font-medium text-foreground">
								Instructions
							</span>
							<span className="text-xs text-tertiary-foreground">
								Freeform guidance the agent always follows
							</span>
						</div>
						<form.AppField name="notes">
							{(field) => (
								<Textarea
									value={field.state.value}
									onChange={(event) => field.handleChange(event.target.value)}
									placeholder="Jot your thoughts, we'll format it for you."
									className="min-h-24"
								/>
							)}
						</form.AppField>
					</div>
				</div>
			</Card>
		</div>
	);
};
