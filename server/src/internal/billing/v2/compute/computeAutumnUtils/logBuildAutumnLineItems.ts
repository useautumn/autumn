import type { LineItem } from "@autumn/shared";
import chalk from "chalk";
import type { Logger } from "@/external/logtail/logtailUtils";

const formatLineItem = (item: LineItem) => ({
	description: item.description,
	amount: item.amount,
	finalAmount: item.finalAmount,
});

export const logBuildAutumnLineItems = ({
	logger,
	deletedLineItems,
	newLineItems,
}: {
	logger: Logger;
	deletedLineItems: LineItem[];
	newLineItems: LineItem[];
}) => {
	logger.info(`buildAutumnLineItems data`, {
		data: {
			deletedLineItems: deletedLineItems.map(formatLineItem),
			newLineItems: newLineItems.map(formatLineItem),
		},
	});

	// Debug output (compact table format)
	const formatLineItemCompact = (item: LineItem) =>
		`  ${item.description}: ${chalk.yellow(item.finalAmount.toFixed(2))}`;

	logger.debug("========== [buildAutumnLineItems] ==========");

	logger.debug("deletedLineItems:");
	if (deletedLineItems.length === 0) logger.debug("  (none)");
	else
		for (const item of deletedLineItems)
			logger.debug(formatLineItemCompact(item));

	logger.debug("newLineItems:");
	if (newLineItems.length === 0) logger.debug("  (none)");
	else
		for (const item of newLineItems) logger.debug(formatLineItemCompact(item));

	logger.debug("=============================================");
};
