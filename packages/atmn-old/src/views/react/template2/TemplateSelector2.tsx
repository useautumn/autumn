import { Box, Text, useInput } from "ink";
import { useMemo, useState } from "react";
import { templates } from "./data.js";
import { calculatePlanWidth } from "./PlanCard.js";
import { calculateCreditSchemaWidth, TemplateRow } from "./TemplateRow.js";

export interface TemplateSelector2Props {
	onSelect?: (templateName: string) => void;
	onCancel?: () => void;
}

export function TemplateSelector2({
	onSelect,
	onCancel,
}: TemplateSelector2Props) {
	const [selectedIndex, setSelectedIndex] = useState(0);

	const { globalTierWidth, globalCreditSchemaWidth } = useMemo(() => {
		let maxTierWidth = 0;
		let maxCreditSchemaWidth = 0;

		for (const template of templates) {
			for (const tier of template.tiers) {
				const width = calculatePlanWidth(tier);
				if (width > maxTierWidth) {
					maxTierWidth = width;
				}
			}

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
				onSelect?.(selected.name);
			}
		} else if (key.escape) {
			onCancel?.();
		}
	});

	return (
		<Box flexDirection="column" paddingX={1} paddingY={1}>
			<Box flexDirection="row" gap={1}>
				<Text color="yellow">{"◆"}</Text>
				<Text bold>Select a pricing template to start with:</Text>
			</Box>

			<Box marginLeft={3} marginBottom={1}>
				<Text dimColor>Press {"↑↓"} to navigate, Enter to select</Text>
			</Box>

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

			<Box marginTop={1} marginLeft={1}>
				<Text dimColor>Esc to cancel</Text>
			</Box>
		</Box>
	);
}
