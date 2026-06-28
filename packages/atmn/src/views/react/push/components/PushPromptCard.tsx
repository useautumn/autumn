import { Text } from "ink";
import type { PushPrompt } from "../../../../commands/push/prompts.js";
import { MultiSelect, PromptCard } from "../../components/index.js";

type VariantConflict = {
	feature_name?: string;
	item_filter?: { interval?: string; interval_count?: number };
	reason?: string;
};

type VariantPropagationOption = {
	conflictCount: number;
	conflicts: VariantConflict[];
	variantName: string;
	variantPlanId: string;
	versionable: boolean;
};

interface PushPromptCardProps {
	prompt: PushPrompt;
	onBack?: () => void;
	onRespond: (value: string) => void;
}

// Helper to safely get data from prompt
function getData<T>(prompt: PushPrompt, key: string): T {
	return prompt.data[key] as T;
}

/**
 * Renders appropriate prompt card based on prompt type
 */
export function PushPromptCard({
	prompt,
	onBack,
	onRespond,
}: PushPromptCardProps) {
	switch (prompt.type) {
		case "prod_confirmation":
			return (
				<PromptCard
					title="Production Environment"
					icon="⚠"
					options={prompt.options}
					onBack={onBack}
					onSelect={onRespond}
				>
					<Text>You are about to push to PRODUCTION.</Text>
					<Text color="yellow">This will affect live customers.</Text>
				</PromptCard>
			);

		case "plan_versioning":
			return (
				<PromptCard
					title="Save Plan Changes"
					icon="⚠"
					options={prompt.options}
					onBack={onBack}
					onSelect={onRespond}
				>
					<Text>
						Plan "{getData<string>(prompt, "planName")}" has customers on it.
					</Text>
					<Text color="yellow">How should this apply?</Text>
				</PromptCard>
			);

		case "plan_migration":
			return (
				<PromptCard
					title="Migrate Existing Customers"
					icon="⚠"
					options={prompt.options}
					onBack={onBack}
					onSelect={onRespond}
				>
					<Text>
						Plan "{getData<string>(prompt, "planName")}" will update the
						existing version.
					</Text>
					<Text color="yellow">
						Create a migration to move current customers to the updated version?
					</Text>
				</PromptCard>
			);

		case "plan_variant_propagation": {
			const groupedVariants = getData<VariantPropagationOption[] | undefined>(
				prompt,
				"variants",
			);
			if (groupedVariants) {
				const basePlanName = getData<string>(prompt, "basePlanName");
				return (
					<PromptCard
						title="Apply Changes to Variants?"
						icon="⚠"
						options={[]}
						onSelect={onRespond}
					>
						<Text>Plan "{basePlanName}" has variants.</Text>
						<Text color="yellow">
							Select which variants should receive the base plan changes.
						</Text>
						<MultiSelect
							onBack={onBack}
							onSubmit={(values) => onRespond(JSON.stringify(values))}
							options={groupedVariants.map((variant) => {
								const conflicts = variant.conflicts
									.map((conflict) => {
										const feature = conflict.feature_name ?? "Unknown feature";
										const interval = conflict.item_filter?.interval ?? "none";
										return `${feature}: ${conflict.reason ?? "conflict"} (${interval})`;
									})
									.join("; ");
								return {
									label: variant.variantName,
									value: variant.variantPlanId,
									description: conflicts || undefined,
								};
							})}
						/>
					</PromptCard>
				);
			}

			const basePlanName = getData<string>(prompt, "basePlanName");
			const variantName = getData<string>(prompt, "variantName");
			const versionable = getData<boolean>(prompt, "versionable");
			const conflictCount = getData<number>(prompt, "conflictCount");
			const conflicts = getData<VariantConflict[]>(prompt, "conflicts");
			return (
				<PromptCard
					title="Apply Changes to Variant?"
					icon="⚠"
					options={prompt.options}
					onBack={onBack}
					onSelect={onRespond}
				>
					<Text>
						Plan "{basePlanName}" has variant "{variantName}".
					</Text>
					<Text color="yellow">
						Choose whether to apply the base plan changes to this variant.
					</Text>
					{versionable && (
						<Text color="yellow">
							Applying will create a new variant version.
						</Text>
					)}
					{conflictCount > 0 && (
						<Text color="yellow">
							{conflictCount} propagation conflict
							{conflictCount > 1 ? "s" : ""} detected.
						</Text>
					)}
					{conflicts?.map((conflict, index) => {
						const feature = conflict.feature_name ?? "Unknown feature";
						const interval = conflict.item_filter?.interval ?? "none";
						return (
							<Text color="gray" key={`${feature}-${index}`}>
								- {feature}: {conflict.reason ?? "conflict"} ({interval})
							</Text>
						);
					})}
				</PromptCard>
			);
		}

		case "plan_delete_has_customers": {
			const count = getData<number>(prompt, "customerCount");
			const firstName = getData<string>(prompt, "firstCustomerName");
			return (
				<PromptCard
					title="Cannot Delete Plan"
					icon="⚠"
					options={prompt.options}
					onBack={onBack}
					onSelect={onRespond}
				>
					<Text>
						Plan "{prompt.entityId}" has {count} customer
						{count > 1 ? "s" : ""}:
					</Text>
					<Text color="gray"> - {firstName}</Text>
					{count > 1 && <Text color="gray"> - ...and {count - 1} others</Text>}
					<Text color="yellow">
						You cannot delete plans that have been used by a customer.
					</Text>
				</PromptCard>
			);
		}

		case "plan_delete_no_customers":
			return (
				<PromptCard
					title="Delete Plan?"
					icon="🗑"
					options={prompt.options}
					onBack={onBack}
					onSelect={onRespond}
				>
					<Text>Plan "{prompt.entityId}" is not in your config.</Text>
					<Text color="gray">No customers are using this plan.</Text>
				</PromptCard>
			);

		case "plan_archived":
			return (
				<PromptCard
					title="Archived Plan"
					icon="📦"
					options={prompt.options}
					onBack={onBack}
					onSelect={onRespond}
				>
					<Text>
						Plan "{getData<string>(prompt, "planName")}" is currently archived.
					</Text>
				</PromptCard>
			);

		case "feature_delete_credit_system": {
			const creditSystems = getData<string[]>(prompt, "creditSystems");
			const firstCreditSystem = getData<string>(prompt, "firstCreditSystem");
			return (
				<PromptCard
					title="Cannot Delete Feature"
					icon="⚠"
					options={prompt.options}
					onBack={onBack}
					onSelect={onRespond}
				>
					<Text>Feature "{prompt.entityId}" is used by credit systems:</Text>
					<Text color="gray"> - {firstCreditSystem}</Text>
					{creditSystems.length > 1 && (
						<Text color="gray">
							{" "}
							- ...and {creditSystems.length - 1} others
						</Text>
					)}
					<Text color="yellow">
						Credit systems reference this feature for billing.
					</Text>
				</PromptCard>
			);
		}

		case "feature_delete_products": {
			const productName = getData<string>(prompt, "productName");
			const productCount = getData<number>(prompt, "productCount");
			return (
				<PromptCard
					title="Cannot Delete Feature"
					icon="⚠"
					options={prompt.options}
					onBack={onBack}
					onSelect={onRespond}
				>
					<Text>Feature "{prompt.entityId}" is used by products:</Text>
					<Text color="gray"> - {productName}</Text>
					{productCount > 1 && (
						<Text color="gray"> - ...and {productCount - 1} others</Text>
					)}
					<Text color="yellow">
						Remove this feature from plans before deleting.
					</Text>
				</PromptCard>
			);
		}

		case "feature_delete_no_deps":
			return (
				<PromptCard
					title="Delete Feature?"
					icon="🗑"
					options={prompt.options}
					onBack={onBack}
					onSelect={onRespond}
				>
					<Text>Feature "{prompt.entityId}" is not in your config.</Text>
					<Text color="gray">No products are using this feature.</Text>
				</PromptCard>
			);

		case "feature_archived":
			return (
				<PromptCard
					title="Archived Feature"
					icon="📦"
					options={prompt.options}
					onBack={onBack}
					onSelect={onRespond}
				>
					<Text>
						Feature "{getData<string>(prompt, "featureId")}" is currently
						archived.
					</Text>
				</PromptCard>
			);

		default:
			return null;
	}
}
