import { Box, Text } from "ink";
import { useCallback, useState } from "react";
import {
	useConfigCounts,
	useWriteTemplateConfig,
} from "../../../../lib/hooks/index.js";
import { writeEmptyConfig } from "../../../../lib/writeEmptyConfig.js";
import {
	SelectMenu,
	type SelectMenuItem,
	StatusLine,
	StepHeader,
} from "../../components/index.js";
import { InlineNukeFlow } from "../../nuke/InlineNukeFlow.js";
import { PullView } from "../../pull/Pull.js";
import { TemplateSelector2 } from "../../template2/TemplateSelector2.js";

type ConfigState =
	| "choosing"
	| "pulling"
	| "nuking"
	| "post_nuke_choice"
	| "template"
	| "complete"
	| "error";

interface ConfigStepProps {
	step: number;
	totalSteps: number;
	onComplete: (hasPricing: boolean) => void;
	targetPath?: string;
}

export function ConfigStep({ step, totalSteps, onComplete, targetPath }: ConfigStepProps) {
	const [configState, setConfigState] = useState<ConfigState>("choosing");
	const [error, setError] = useState<string | null>(null);
	const [completionAction, setCompletionAction] = useState<
		"pull" | "nuke" | "template" | "blank" | null
	>(null);

	// Fetch configuration counts using TanStack Query
	const {
		data: configCounts,
		isLoading,
		error: fetchError,
	} = useConfigCounts();

	// Mutation for writing template config
	const writeTemplateConfig = useWriteTemplateConfig();

	const plansCount = configCounts?.plansCount ?? 0;
	const featuresCount = configCounts?.featuresCount ?? 0;
	const hasExistingConfig = plansCount > 0 || featuresCount > 0;

	const handlePullExisting = useCallback(() => {
		setConfigState("pulling");
	}, []);

	const handleNuke = useCallback(() => {
		setConfigState("nuking");
	}, []);

	const handleTemplate = useCallback(() => {
		setConfigState("template");
	}, []);

	const handleBlank = useCallback(() => {
		try {
			writeEmptyConfig(targetPath);
			setCompletionAction("blank");
			setConfigState("complete");
			setTimeout(() => {
				onComplete(false); // No pricing
			}, 1000);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to write config");
			setConfigState("error");
		}
	}, [onComplete, targetPath]);

	const handleTemplateSelect = useCallback(
		(template: string) => {
			writeTemplateConfig.mutate(
				{ template, cwd: targetPath },
				{
					onSuccess: () => {
						setCompletionAction("template");
						setConfigState("complete");
						setTimeout(() => {
							onComplete(true); // Has pricing from template
						}, 1000);
					},
					onError: (err) => {
						setError(
							err instanceof Error ? err.message : "Failed to write config",
						);
						setConfigState("error");
					},
				},
			);
		},
		[onComplete, writeTemplateConfig, targetPath],
	);

	const handleTemplateCancel = useCallback(() => {
		// If we came from post-nuke choice, go back there; otherwise go back to main choosing
		if (completionAction === "nuke") {
			setConfigState("post_nuke_choice");
		} else {
			setConfigState("choosing");
		}
	}, [completionAction]);

	const handleSelectOption = useCallback(
		(item: SelectMenuItem<string>) => {
			if (item.value === "pull") {
				handlePullExisting();
			} else if (item.value === "nuke") {
				handleNuke();
			} else if (item.value === "template") {
				handleTemplate();
			} else if (item.value === "blank") {
				handleBlank();
			}
		},
		[handlePullExisting, handleNuke, handleTemplate, handleBlank],
	);

	const handlePostNukeSelect = useCallback(
		(item: SelectMenuItem<string>) => {
			if (item.value === "template") {
				setCompletionAction("nuke"); // Track that we came from nuke
				handleTemplate();
			} else if (item.value === "blank") {
				handleBlank();
			}
		},
		[handleTemplate, handleBlank],
	);

	// Menu items based on whether config exists
	const menuItems: SelectMenuItem<string>[] = hasExistingConfig
		? [
				{
					label: `Pull existing (${plansCount} plan${plansCount !== 1 ? "s" : ""}, ${featuresCount} feature${featuresCount !== 1 ? "s" : ""})`,
					value: "pull",
				},
				{
					label: "Nuke and start fresh",
					value: "nuke",
				},
			]
		: [
				{
					label: "Use a template",
					value: "template",
				},
				{
					label: "Start from scratch",
					value: "blank",
				},
			];

	// Post-nuke menu items
	const postNukeMenuItems: SelectMenuItem<string>[] = [
		{
			label: "Use a template",
			value: "template",
		},
		{
			label: "Start from scratch",
			value: "blank",
		},
	];

	// Handle loading state from query
	if (isLoading) {
		return (
			<Box flexDirection="column" marginBottom={1}>
				<StepHeader step={step} totalSteps={totalSteps} title="Configuration" />
				<StatusLine status="loading" message="Checking your sandbox..." />
			</Box>
		);
	}

	// Handle error state from query
	if (fetchError) {
		return (
			<Box flexDirection="column" marginBottom={1}>
				<StepHeader step={step} totalSteps={totalSteps} title="Configuration" />
				<StatusLine
					status="error"
					message={
						fetchError instanceof Error
							? fetchError.message
							: "Failed to fetch configuration"
					}
				/>
			</Box>
		);
	}

	return (
		<Box flexDirection="column" marginBottom={1}>
			<StepHeader step={step} totalSteps={totalSteps} title="Configuration" />
			{configState === "choosing" && (
				<Box flexDirection="column">
					<Text>
						{hasExistingConfig
							? "Found existing pricing in your sandbox:"
							: "Your sandbox is empty. How do you want to start?"}
					</Text>
					<Box marginTop={1}>
						<SelectMenu items={menuItems} onSelect={handleSelectOption} />
					</Box>
				</Box>
			)}
			{configState === "pulling" && (
				<PullView
					cwd={targetPath}
					onComplete={() => {
						setCompletionAction("pull");
						setConfigState("complete");
						setTimeout(() => {
							onComplete(true); // Has pricing from pull
						}, 1000);
					}}
				/>
			)}
			{configState === "nuking" && (
				<InlineNukeFlow
					onComplete={() => {
						setCompletionAction("nuke");
						setConfigState("post_nuke_choice");
					}}
					onCancel={() => {
						setConfigState("choosing");
					}}
				/>
			)}
			{configState === "post_nuke_choice" && (
				<Box flexDirection="column">
					<StatusLine status="success" message="Sandbox cleared" />
					<Box marginTop={1} flexDirection="column">
						<Text>Now, how do you want to set up your pricing?</Text>
						<Box marginTop={1}>
							<SelectMenu
								items={postNukeMenuItems}
								onSelect={handlePostNukeSelect}
							/>
						</Box>
					</Box>
				</Box>
			)}
			{configState === "template" && (
				<TemplateSelector2
					onSelect={(templateName) => {
						handleTemplateSelect(templateName);
					}}
					onCancel={handleTemplateCancel}
				/>
			)}
			{configState === "complete" && (
				<Box flexDirection="column">
					<StatusLine
						status="success"
						message={
							completionAction === "blank"
								? "Created autumn.config.ts"
								: completionAction === "template"
									? "Config ready"
									: completionAction === "pull"
										? "Config pulled"
										: "Config reset"
						}
					/>
				</Box>
			)}
			{configState === "error" && (
				<StatusLine status="error" message={error || "Something went wrong"} />
			)}
		</Box>
	);
}
