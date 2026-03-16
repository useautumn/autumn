import { Text } from "ink";
import type { PushPrompt } from "../../../../commands/push/prompts.js";
import { PromptCard } from "../../components/index.js";

interface PushPromptCardProps {
	prompt: PushPrompt;
	onRespond: (value: string) => void;
}

// Helper to safely get data from prompt
function getData<T>(prompt: PushPrompt, key: string): T {
	return prompt.data[key] as T;
}

/**
 * Renders appropriate prompt card based on prompt type
 */
export function PushPromptCard({ prompt, onRespond }: PushPromptCardProps) {
	switch (prompt.type) {
		case "prod_confirmation":
			return (
				<PromptCard
					title="Production Environment"
					icon="⚠"
					options={prompt.options}
					onSelect={onRespond}
				>
					<Text>You are about to push to PRODUCTION.</Text>
					<Text color="yellow">This will affect live customers.</Text>
				</PromptCard>
			);

		case "plan_versioning":
			return (
				<PromptCard
					title="Plan Has Customers"
					icon="⚠"
					options={prompt.options}
					onSelect={onRespond}
				>
					<Text>
						Plan "{getData<string>(prompt, "planName")}" has customers on it.
					</Text>
					<Text color="yellow">Updating will create a new version.</Text>
				</PromptCard>
			);

		case "plan_delete_has_customers": {
			const count = getData<number>(prompt, "customerCount");
			const firstName = getData<string>(prompt, "firstCustomerName");
			return (
				<PromptCard
					title="Cannot Delete Plan"
					icon="⚠"
					options={prompt.options}
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
