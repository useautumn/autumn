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

export function calculateCreditSchemaWidth(
	costs: TemplateCreditCost[],
): number {
	const titleWidth = "Credit Costs".length;
	const maxRowWidth = Math.max(
		...costs.map((c) => c.action.length + 2 + c.credits.length),
	);
	return Math.max(titleWidth, maxRowWidth) + 6;
}

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

export function TemplateRow({
	template,
	isSelected,
	isLast = false,
	cardWidth,
	creditSchemaWidth,
}: TemplateRowProps) {
	const indicator = isSelected ? (
		<Text color="cyan" bold>
			{"●"}
		</Text>
	) : (
		<Text dimColor>{"○"}</Text>
	);

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

	if (!isSelected) {
		return (
			<Box flexDirection="column" paddingY={0}>
				{header}
			</Box>
		);
	}

	let tiersHeight = 0;
	for (const tier of template.tiers) {
		tiersHeight += 2 + 1 + tier.features.length;
	}

	const hasCreditSystem =
		template.creditSystem && template.creditSystem.costs.length > 0;

	return (
		<Box flexDirection="column">
			{header}

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
				<Text dimColor>{template.description}</Text>

				<Box flexDirection="row" marginTop={1} gap={1}>
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

					{hasCreditSystem && (
				<CreditSchemaCard
						costs={template.creditSystem?.costs ?? []}
						height={tiersHeight}
						width={creditSchemaWidth}
					/>
					)}
				</Box>

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
