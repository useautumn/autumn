import { Text } from "ink";
import type {
	ConfigResourceChange,
	PromptOption,
} from "../../../../commands/push/prompts.js";
import { PromptCard } from "../../components/PromptCard.js";

export function ConfigResourcesPromptCard({
	changes,
	onBack,
	onRespond,
	options,
}: {
	changes: ConfigResourceChange[];
	onBack?: () => void;
	onRespond: (value: string) => void;
	options: PromptOption[];
}) {
	return (
		<PromptCard
			title="Review config changes"
			icon="⚠"
			options={options}
			onBack={onBack}
			onSelect={onRespond}
		>
			{changes.slice(0, 6).map(({ action, id, resourceType }) => (
				<Text key={`${resourceType}:${id}`}>
					{resourceType === "reward" ? "Reward" : "Referral program"} "{id}"
					will be {action}.
				</Text>
			))}
			{changes.length > 6 && (
				<Text color="gray">...and {changes.length - 6} more</Text>
			)}
		</PromptCard>
	);
}
