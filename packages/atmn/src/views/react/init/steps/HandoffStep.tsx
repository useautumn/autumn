import { MultiSelect, TextInput } from "@inkjs/ui";
import { Box, Text, useApp } from "ink";
import open from "open";
import React, { useState } from "react";
import { useClipboard, useCreateSkills } from "../../../../lib/hooks/index.js";
import { SelectMenu, StatusLine, StepHeader } from "../../components/index.js";

// System prompt for AI integration - will be copied to clipboard
const SYSTEM_PROMPT = `You are an expert AI assistant that helps users set up Autumn, a billing and entitlements layer over Stripe. The user has already installed Autumn Skills ready for you to use the load skill tool.

The user's business structure in terms of its billing, pricing, plans and features are set out in a file called 'autumn.config.ts'.
If this file is empty, then you should help the user model their pricing structure by loading the 'autumn-modelling-pricing-plans' skill. If there is no pricing structure - you MUST initiate the user into a discussion about the plans they want, the prices of each, the limits, how often usage should reset, how much usage they should get etc... Do not make any decisions on that regard on your own. Make these prompts conversational; Don't ask every question to the user immediately. Ask for a general overview and then make follow up questions until you or the user is sure.

Once a pricing model is either decided upon or already found to exist already continue onwards:

- Begin by setting up Autumn in the codebase by loading the 'autumn-setup' skill (install SDK, create customer, payment flow).
- Then build the billing page by loading the 'autumn-billing-page' skill (display plans, switching, cancelling).
- Lastly add usage gating by loading the 'autumn-gating' skill (check access, track usage).`;

interface HandoffStepProps {
	step: number;
	totalSteps: number;
	hasPricing: boolean;
	hasCustomers: boolean;
	onComplete: () => void;
}

type HandoffState =
	| "ai_choice"
	| "location_choice"
	| "custom_path_input"
	| "creating"
	| "next_steps"
	| "complete_with_customers"
	| "manual_exit";

type NextStepChoice = "docs" | "copy" | "exit";

const PRESET_LOCATIONS = [
	{ label: ".claude/skills (Claude Code)", value: ".claude/skills" },
	{
		label: ".agents/skills (OpenCode, Cursor, Amp, Codex...)",
		value: ".agents/skills",
	},
	{ label: "Custom path...", value: "custom" },
];

export function HandoffStep({
	step,
	totalSteps,
	hasPricing,
	hasCustomers,
	onComplete,
}: HandoffStepProps) {
	const { exit } = useApp();
	const { copy, showingFeedback } = useClipboard();
	// Start with ai_choice if no customers, otherwise complete
	const [state, setState] = useState<HandoffState>(
		hasCustomers ? "complete_with_customers" : "ai_choice",
	);
	const [customPath, setCustomPath] = useState("");
	const [selectedLocations, setSelectedLocations] = useState<string[]>([]);
	const [allCreatedDirs, setAllCreatedDirs] = useState<string[]>([]);
	const [lastNextStepChoice, setLastNextStepChoice] =
		useState<NextStepChoice>("exit");
	const { create, state: skillsState, filesCreated, error } = useCreateSkills();

	const nextStepsOptions = [
		{ label: "Open Autumn docs", value: "docs" },
		{
			label: "Copy our AI system prompt to implement Autumn for you",
			value: "copy",
		},
		{ label: "Thanks, I'll figure it out myself", value: "exit" },
	];

	const aiChoiceOptions = [
		{ label: "Yes", value: "yes" },
		{ label: "No thanks", value: "no" },
	];

	const handleAiChoice = (value: string) => {
		if (value === "no") {
			// Skip to next_steps
			setState("next_steps");
			return;
		}
		// Show location selector
		setState("location_choice");
	};

	const handleLocationSubmit = async (values: string[]) => {
		if (values.length === 0) {
			// Nothing selected, go to next_steps
			setState("next_steps");
			return;
		}

		// Store selections
		setSelectedLocations(values);

		// Check if custom path was selected
		if (values.includes("custom")) {
			setState("custom_path_input");
			return;
		}

		// No custom path needed, create skills directly
		await createSkillsInLocations(values);
	};

	const handleCustomPathSubmit = async (value: string) => {
		const trimmedPath = value.trim();

		// Replace "custom" with actual path (or remove if empty)
		const locations = selectedLocations
			.filter((loc) => loc !== "custom")
			.concat(trimmedPath ? [trimmedPath] : []);

		if (locations.length === 0) {
			// No locations, go to next_steps
			setState("next_steps");
			return;
		}

		await createSkillsInLocations(locations);
	};

	const createSkillsInLocations = async (locations: string[]) => {
		setState("creating");

		// Create skills in all selected locations
		for (const location of locations) {
			await create(location, { saveAll: true, hasPricing });
		}

		setAllCreatedDirs(locations);
		// After creating skills, go to next_steps
		setState("next_steps");
	};

	const handleNextStepsChoice = async (value: string) => {
		setLastNextStepChoice(value as NextStepChoice);

		if (value === "docs") {
			await open("https://docs.useautumn.com");
		} else if (value === "copy") {
			await copy(SYSTEM_PROMPT);
		}

		// All options exit the app
		setState("manual_exit");
		setTimeout(() => {
			exit();
		}, 900);
	};

	// User already has customers - they're all set!
	if (state === "complete_with_customers") {
		setTimeout(() => {
			exit();
		}, 900);

		return (
			<Box flexDirection="column" marginBottom={1}>
				<StepHeader step={step} totalSteps={totalSteps} title="Next Steps" />
				<Box flexDirection="column">
					<StatusLine
						status="success"
						message={
							<Text>
								You're all set - next, run <Text color="cyan">atmn push</Text>{" "}
								when you're ready to sync your config.
							</Text>
						}
					/>
					<Box marginTop={1} flexDirection="column" gap={0}>
						<Text dimColor>
							Docs: <Text color="cyan">https://docs.useautumn.com</Text>
						</Text>
						<Text dimColor>
							Discord: <Text color="cyan">https://discord.gg/atmn</Text>
						</Text>
					</Box>
				</Box>
			</Box>
		);
	}

	// First question: Would you like AI skills?
	if (state === "ai_choice") {
		return (
			<Box flexDirection="column" marginBottom={1}>
				<StepHeader step={step} totalSteps={totalSteps} title="Next Steps" />
				<Box flexDirection="column">
					<Text>
						Would you like to install AI skills to help model your pricing plans
						and implement Autumn into your codebase?
					</Text>
					<Box marginTop={1}>
						<SelectMenu
							items={aiChoiceOptions}
							onSelect={(item) => handleAiChoice(item.value)}
						/>
					</Box>
				</Box>
			</Box>
		);
	}

	// Multi-select for skill locations
	if (state === "location_choice") {
		return (
			<Box flexDirection="column" marginBottom={1}>
				<StepHeader step={step} totalSteps={totalSteps} title="Next Steps" />
				<Box flexDirection="column">
					<Text>Where should we save the skills?</Text>
					<Text dimColor>(space to select, enter to confirm)</Text>
					<Box marginTop={1}>
						<MultiSelect
							options={PRESET_LOCATIONS}
							defaultValue={[".claude/skills"]}
							onSubmit={handleLocationSubmit}
						/>
					</Box>
				</Box>
			</Box>
		);
	}

	// Custom path input
	if (state === "custom_path_input") {
		return (
			<Box flexDirection="column" marginBottom={1}>
				<StepHeader step={step} totalSteps={totalSteps} title="Next Steps" />
				<Box flexDirection="column">
					<Text>Enter the custom path (relative to project root):</Text>
					<Box marginTop={1}>
						<Text color="gray">{">"} </Text>
						<TextInput
							placeholder={process.cwd()}
							defaultValue={customPath}
							onChange={setCustomPath}
							onSubmit={handleCustomPathSubmit}
						/>
					</Box>
				</Box>
			</Box>
		);
	}

	// Creating skills
	if (state === "creating") {
		return (
			<Box flexDirection="column" marginBottom={1}>
				<StepHeader step={step} totalSteps={totalSteps} title="Next Steps" />
				<StatusLine status="loading" message="Setting up your skills..." />
			</Box>
		);
	}

	// Next steps menu (shown after skills created or skipped)
	if (state === "next_steps") {
		return (
			<Box flexDirection="column" marginBottom={1}>
				<StepHeader step={step} totalSteps={totalSteps} title="Next Steps" />
				<Box flexDirection="column">
					{/* Show created skills if any */}
					{allCreatedDirs.length > 0 && (
						<Box marginBottom={1} flexDirection="column">
							<StatusLine status="success" message="Skills created!" />
							<Box marginTop={1} flexDirection="column">
								{allCreatedDirs.map((dir) => (
									<Box key={dir} flexDirection="column">
										<Text color="cyan">{dir}/</Text>
										{filesCreated.map((file, index) => (
											<Text key={`${dir}-${file}`} color="cyan">
												{index === filesCreated.length - 1 ? "└── " : "├── "}
												{file}
											</Text>
										))}
									</Box>
								))}
							</Box>
						</Box>
					)}

					<Text>What would you like to do next?</Text>
					{showingFeedback && (
						<Box marginTop={1}>
							<Text color="green">Copied to clipboard!</Text>
						</Box>
					)}
					<Box marginTop={1}>
						<SelectMenu
							items={nextStepsOptions}
							onSelect={(item) => handleNextStepsChoice(item.value)}
						/>
					</Box>
				</Box>
			</Box>
		);
	}

	// Manual exit
	if (state === "manual_exit") {
		const finalMessage =
			lastNextStepChoice === "docs" ? (
				"You're all set - we're opening the docs now for you."
			) : lastNextStepChoice === "copy" ? (
				"You're all set - paste the prompt we copied into your agent of choice to get started."
			) : (
				<Text>
					You're all set - next, run <Text color="cyan">atmn push</Text> when
					you're ready to sync your config.
				</Text>
			);

		return (
			<Box flexDirection="column" marginBottom={1}>
				<StepHeader step={step} totalSteps={totalSteps} title="Next Steps" />
				<Box flexDirection="column">
					<StatusLine status="success" message={finalMessage} />
					<Box marginTop={1} flexDirection="column" gap={0}>
						<Text dimColor>
							Docs: <Text color="cyan">https://docs.useautumn.com</Text>
						</Text>
						<Text dimColor>
							Discord: <Text color="cyan">https://discord.gg/atmn</Text>
						</Text>
						<Text dimColor>
							Run <Text color="magenta">atmn push</Text> when you're ready to
							sync your config
						</Text>
					</Box>
				</Box>
			</Box>
		);
	}

	return null;
}
