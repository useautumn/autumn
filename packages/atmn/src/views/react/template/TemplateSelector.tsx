import { Box, Text, useInput } from "ink";
import React, { useState } from "react";
import { templateData, templates } from "../../../lib/constants/templates.js";

interface TemplateSelectorProps {
	onSelect?: (template: string) => void;
	onCancel?: () => void;
}

// Total width of all 3 cards + gaps
const CARDS_TOTAL_WIDTH = 84;

export const TemplateSelector: React.FC<TemplateSelectorProps> = ({
	onSelect,
	onCancel,
}) => {
	const [activeIndex, setActiveIndex] = useState(1); // Start on RatGPT (middle)

	const activeTemplate = templates[activeIndex];

	useInput((_input, key) => {
		if (key.tab || key.rightArrow) {
			// Next template
			setActiveIndex((prev) => (prev + 1) % templates.length);
		} else if (key.leftArrow) {
			// Previous template
			setActiveIndex(
				(prev) => (prev - 1 + templates.length) % templates.length,
			);
		} else if (key.return) {
			// Confirm selection
			if (activeTemplate) {
				onSelect?.(activeTemplate);
			}
		} else if (key.escape) {
			// Cancel
			onCancel?.();
		}
	});

	if (!activeTemplate) {
		return <Text color="red">No template selected</Text>;
	}

	const plans = templateData[activeTemplate];
	if (!plans) {
		return <Text color="red">Invalid template data</Text>;
	}

	const [plan0, plan1, plan2] = plans;
	if (!plan0 || !plan1 || !plan2) {
		return <Text color="red">Incomplete plan data</Text>;
	}

	return (
		<Box flexDirection="column" paddingX={2} paddingY={1}>
			{/* Template Tabs - single box spanning all cards */}
			<Box
				flexDirection="row"
				borderStyle="round"
				borderColor="magenta"
				paddingX={2}
				paddingY={0}
				marginBottom={1}
				width={CARDS_TOTAL_WIDTH}
				justifyContent="space-between"
			>
				<Text color="magenta">←</Text>
				{templates.map((template: string, idx: number) => (
					<React.Fragment key={template}>
						{idx > 0 && <Text color="gray">│</Text>}
						<Text color={idx === activeIndex ? "magenta" : "white"} bold>
							{" "}
							{template}{" "}
						</Text>
					</React.Fragment>
				))}
				<Text color="magenta">→</Text>
			</Box>

			{/* Plan Cards - 3 columns, centered within fixed width */}
			<Box
				flexDirection="row"
				width={CARDS_TOTAL_WIDTH}
				justifyContent="center"
			>
				<Box flexDirection="row" gap={1} alignItems="center">
					{/* Left Card */}
					<Box
						borderStyle="round"
						borderColor="magenta"
						paddingX={2}
						paddingY={1}
						flexDirection="column"
					>
						<Text bold color="cyan" dimColor>
							{plan0.name}
						</Text>
						<Box marginTop={1} />
						{plan0.features.map((feature: string) => (
							<Box key={feature}>
								<Text dimColor>• {feature}</Text>
							</Box>
						))}
						<Box marginTop={1}>
							<Text bold color="green">
								{plan0.price}
							</Text>
						</Box>
					</Box>

					{/* Center Card */}
					<Box
						borderStyle="round"
						borderColor="magenta"
						paddingX={2}
						paddingY={1}
						flexDirection="column"
					>
						<Text bold color="magenta">
							{plan1.name}
						</Text>
						{plan1.badge && (
							<Text italic color="yellow">
								{plan1.badge}
							</Text>
						)}
						<Box marginTop={1} />
						{plan1.features.map((feature: string) => (
							<Box key={feature}>
								<Text>• {feature}</Text>
							</Box>
						))}
						<Box marginTop={1}>
							<Text bold color="green">
								{plan1.price}
							</Text>
						</Box>
					</Box>

					{/* Right Card */}
					<Box
						borderStyle="round"
						borderColor="magenta"
						paddingX={2}
						paddingY={1}
						flexDirection="column"
					>
						<Text bold color="cyan" dimColor>
							{plan2.name}
						</Text>
						<Box marginTop={1} />
						{plan2.features.map((feature: string) => (
							<Box key={feature}>
								<Text dimColor>• {feature}</Text>
							</Box>
						))}
						<Box marginTop={1}>
							<Text bold color="green">
								{plan2.price}
							</Text>
						</Box>
					</Box>
				</Box>
			</Box>

			{/* Hint for controls */}
			<Box marginTop={1}>
				<Text dimColor>
					← → switch templates • Enter to confirm • Esc to cancel
				</Text>
			</Box>
		</Box>
	);
};
