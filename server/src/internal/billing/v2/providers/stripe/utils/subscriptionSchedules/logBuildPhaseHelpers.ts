import { type FullCusProduct, formatMs } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";

/**
 * Logs transition points and customer products for debugging phase construction.
 */
export const logTransitionPoints = ({
	ctx,
	customerProducts,
	transitionPoints,
	nowMs,
}: {
	ctx: AutumnContext;
	customerProducts: FullCusProduct[];
	transitionPoints: (number | undefined)[];
	nowMs: number;
}): void => {
	ctx.logger.debug(
		`[logTransitionPoints] Now: ${formatMs(nowMs)}, Transition points: ${transitionPoints.length}`,
	);

	ctx.logger.debug(
		`[logTransitionPoints] Customer products (${customerProducts.length}):`,
	);

	for (const customerProduct of customerProducts) {
		const entity = customerProduct.entity_id
			? `@${customerProduct.entity_id}`
			: "";
		const startsAt = formatMs(customerProduct.starts_at);
		const endedAt = customerProduct.ended_at
			? formatMs(customerProduct.ended_at)
			: "indefinite";

		ctx.logger.debug(
			`[logTransitionPoints]   - ${customerProduct.product.name}${entity}: ${startsAt} -> ${endedAt} (${customerProduct.status})`,
		);
	}

	ctx.logger.debug("[logTransitionPoints] Transition points:");
	for (let i = 0; i < transitionPoints.length; i++) {
		ctx.logger.debug(
			`[logTransitionPoints]   ${i + 1}. ${formatMs(transitionPoints[i])}`,
		);
	}
};

/**
 * Logs a single phase during the build process.
 * This is a flexible helper that accepts a custom format function for items.
 */
const logPhase = <T>({
	ctx,
	logPrefix,
	phaseIndex,
	startSeconds,
	endSeconds,
	activeProducts,
	items,
	formatItem,
}: {
	ctx: AutumnContext;
	logPrefix: string;
	phaseIndex: number;
	startSeconds: number;
	endSeconds: number | undefined;
	activeProducts: string[];
	items: T[];
	formatItem: (item: T) => string;
}): void => {
	const startMs = startSeconds * 1000;
	const endMs = endSeconds ? endSeconds * 1000 : undefined;

	const startDate = formatMs(startMs);
	const endDate = endMs ? formatMs(endMs) : "indefinite";

	ctx.logger.debug(
		`${logPrefix} Phase ${phaseIndex + 1}: ${startDate} -> ${endDate}`,
	);
	ctx.logger.debug(
		`${logPrefix}   Active products: [${activeProducts.join(", ")}]`,
	);
	ctx.logger.debug(`${logPrefix}   Items (${items.length}):`);

	for (const item of items) {
		ctx.logger.debug(`${logPrefix}     - ${formatItem(item)}`);
	}
};
