import { Box, Text } from "ink";
import React from "react";
import { Badge } from "./Badge.js";
import type { Template, TemplateCreditCost } from "./data.js";
import { PlanCard } from "./PlanCard.js";

export interface TemplateRowProps {
	template: Template;
	isSelected: boolean;
	isLast?: boolean;
	cardWidth?: number;
	creditSchemaWidth?: number;
}

/**
 * Calculate the width needed for a credit schema card
 */
export function calculateCreditSchemaWidth(
	costs: TemplateCreditCost[],
): number {
	const titleWidth = "Credit Costs".length;
	// Each row: action + gap(2) + credits
	const maxRowWidth = Math.max(
		...costs.map((c) => c.action.length + 2 + c.credits.length),
	);
	// Add padding (2 on each side) + border (2)
	return Math.max(titleWidth, maxRowWidth) + 6;
}

/**
 * Credit schema card - shows credit costs for templates with credit systems
 */
function CreditSchemaCard({
	costs,
	height,
	width,
}: {
	costs: TemplateCreditCost[];
	height: number;
	width?: number;
}) {
	return (
		<Box
			flexDirection="column"
			borderStyle="round"
			borderColor="gray"
			paddingX={1}
			paddingY={0}
			height={height}
			width={width}
		>
			<Text color="cyan" bold>
				Credit Costs
			</Text>
			<Box flexDirection="column" marginTop={0}>
				{costs.map((cost) => (
					<Box
						key={cost.action}
						flexDirection="row"
						justifyContent="space-between"
						gap={2}
					>
						<Text dimColor>{cost.action}</Text>
						<Text color="yellow">{cost.credits}</Text>
					</Box>
				))}
			</Box>
		</Box>
	);
}

/**
 * Single template row - collapsed or expanded based on selection state
 */
export function TemplateRow({
	template,
	isSelected,
	isLast = false,
	cardWidth,
	creditSchemaWidth,
}: TemplateRowProps) {
	// Circle indicator
	const indicator = isSelected ? (
		<Text color="cyan" bold>
			{"●"}
		</Text>
	) : (
		<Text dimColor>{"○"}</Text>
	);

	// Header row with name and badges
	const header = (
		<Box flexDirection="row" gap={1} alignItems="center">
			{indicator}
			<Text color={isSelected ? "cyan" : "white"} bold={isSelected}>
				{template.name}
			</Text>
			{template.badges.map((badge, idx) => (
				<Badge
					key={`${template.id}-${badge.label}-${idx}`}
					label={badge.label}
					color={badge.color}
				/>
			))}
		</Box>
	);

	// Collapsed view - just the header
	if (!isSelected) {
		return (
			<Box flexDirection="column" paddingY={0}>
				{header}
			</Box>
		);
	}

	// Calculate total height for credit schema card
	// Each tier card: 2 (border) + 1 (title row) + features count
	let tiersHeight = 0;
	for (const tier of template.tiers) {
		tiersHeight += 2 + 1 + tier.features.length;
	}

	const hasCreditSystem =
		template.creditSystem && template.creditSystem.costs.length > 0;

	// Expanded view - header + content with left border
	return (
		<Box flexDirection="column">
			{header}

			{/* Content area with left border using borderLeft */}
			<Box
				flexDirection="column"
				marginLeft={1}
				borderStyle="round"
				borderColor="gray"
				borderTop={false}
				borderRight={false}
				borderBottom={false}
				paddingLeft={1}
			>
				{/* Description */}
				<Text dimColor>{template.description}</Text>

				{/* Cards area - horizontal layout with tiers on left, credit schema on right */}
				<Box flexDirection="row" marginTop={1} gap={1}>
					{/* Tier cards column */}
					<Box flexDirection="column">
						{template.tiers.map((tier, index) => (
							<PlanCard
								key={tier.name}
								tier={tier}
								index={index}
								width={cardWidth}
							/>
						))}
					</Box>

					{/* Credit schema card - only show if template has credit system */}
					{hasCreditSystem && (
				<CreditSchemaCard
						costs={template.creditSystem?.costs ?? []}
						height={tiersHeight}
						width={creditSchemaWidth}
					/>
					)}
				</Box>

				{/* Hint */}
				<Box marginTop={1}>
					<Text dimColor>
						Press{" "}
						<Text bold color="white">
							Enter
						</Text>{" "}
						to use this template
					</Text>
				</Box>
			</Box>
		</Box>
	);
}
