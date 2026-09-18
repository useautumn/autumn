import { Box, Text, useInput } from "ink";
import { useMemo, useState } from "react";
import { templates } from "./data.js";
import { calculatePlanWidth } from "./PlanCard.js";
import { calculateCreditSchemaWidth, TemplateRow } from "./TemplateRow.js";

export interface TemplateSelector2Props {
	/** Called with the template name (e.g. "OpenAI", "T3 Chat") */
	onSelect?: (templateName: string) => void;
	onCancel?: () => void;
}

/**
 * Template selector with expandable vertical list
 * - Up/Down arrows to navigate
 * - Enter to select
 * - Esc to cancel
 */
export function TemplateSelector2({
	onSelect,
	onCancel,
}: TemplateSelector2Props) {
	const [selectedIndex, setSelectedIndex] = useState(0);

	// Precalculate widths across ALL templates to prevent layout shift
	const { globalTierWidth, globalCreditSchemaWidth } = useMemo(() => {
		let maxTierWidth = 0;
		let maxCreditSchemaWidth = 0;

		for (const template of templates) {
			// Calculate max tier card width
			for (const tier of template.tiers) {
				const width = calculatePlanWidth(tier);
				if (width > maxTierWidth) {
					maxTierWidth = width;
				}
			}

			// Calculate max credit schema card width
			if (template.creditSystem?.costs) {
				const width = calculateCreditSchemaWidth(template.creditSystem.costs);
				if (width > maxCreditSchemaWidth) {
					maxCreditSchemaWidth = width;
				}
			}
		}

		return {
			globalTierWidth: maxTierWidth,
			globalCreditSchemaWidth: maxCreditSchemaWidth,
		};
	}, []);

	useInput((_input, key) => {
		if (key.upArrow) {
			setSelectedIndex((prev) => (prev > 0 ? prev - 1 : templates.length - 1));
		} else if (key.downArrow) {
			setSelectedIndex((prev) => (prev < templates.length - 1 ? prev + 1 : 0));
		} else if (key.return) {
			const selected = templates[selectedIndex];
			if (selected) {
				// Pass the template name to match templateConfigs keys
				onSelect?.(selected.name);
			}
		} else if (key.escape) {
			onCancel?.();
		}
	});

	return (
		<Box flexDirection="column" paddingX={1} paddingY={1}>
			{/* Header */}
			<Box flexDirection="row" gap={1}>
				<Text color="yellow">{"◆"}</Text>
				<Text bold>Select a pricing template to start with:</Text>
			</Box>

			{/* Instructions */}
			<Box marginLeft={3} marginBottom={1}>
				<Text dimColor>Press {"↑↓"} to navigate, Enter to select</Text>
			</Box>

			{/* Template list */}
			<Box flexDirection="column">
				{templates.map((template, index) => (
					<TemplateRow
						key={template.id}
						template={template}
						isSelected={index === selectedIndex}
						isLast={index === templates.length - 1}
						cardWidth={globalTierWidth}
						creditSchemaWidth={globalCreditSchemaWidth}
					/>
				))}
			</Box>

			{/* Footer */}
			<Box marginTop={1} marginLeft={1}>
				<Text dimColor>Esc to cancel</Text>
			</Box>
		</Box>
	);
}
