import type {
	CustomLineItem,
	DbInvoiceLineItem,
	InvoicePlanParams,
	ReissueLineEdits,
} from "@autumn/shared";
import { atmnToStripeAmount, ErrCode, RecaseError } from "@autumn/shared";
import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { computeReissueCatalogLines } from "./computeReissueCatalogLines";

type StripeLine = Stripe.InvoiceAddLinesParams.Line;

const isCatalogPlan = (
	entry: NonNullable<ReissueLineEdits["add"]>[number],
): entry is InvoicePlanParams => "plan_id" in entry;

/** Autumn line item id -> the Stripe line it was copied from. */
const stripeIdsByLineId = ({
	storedLines,
}: {
	storedLines: DbInvoiceLineItem[];
}) =>
	new Map(
		storedLines
			.filter((line) => line.stripe_id)
			.map((line) => [line.id, line.stripe_id as string]),
	);

/**
 * Applies the request's line edits to the lines copied off the original.
 * Edits address Autumn's line item ids, which map onto the Stripe lines the
 * copies came from via `autumn_reissued_from_line`.
 */
export const applyReissueLineEdits = async ({
	ctx,
	customerId,
	lines,
	storedLines,
	edits,
	currency,
}: {
	ctx: AutumnContext;
	customerId: string;
	lines: StripeLine[];
	storedLines: DbInvoiceLineItem[];
	edits?: ReissueLineEdits;
	currency: string;
}): Promise<StripeLine[]> => {
	if (!edits) return lines;

	const stripeIds = stripeIdsByLineId({ storedLines });
	const resolve = (lineItemId: string) => {
		const stripeId = stripeIds.get(lineItemId);
		if (!stripeId) {
			throw new RecaseError({
				message: `Invoice line item ${lineItemId} is not on this invoice`,
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}
		return stripeId;
	};

	const removed = new Set((edits.remove ?? []).map(resolve));
	const updates = new Map(
		(edits.update ?? []).map((update) => [resolve(update.id), update]),
	);

	const sourceLineId = (line: StripeLine) =>
		typeof line.metadata === "object"
			? (line.metadata?.autumn_reissued_from_line as string | undefined)
			: undefined;

	const kept = lines
		.filter((line) => {
			const source = sourceLineId(line);
			return !source || !removed.has(source);
		})
		.map((line) => {
			const source = sourceLineId(line);
			const update = source ? updates.get(source) : undefined;
			if (!update) return line;
			return {
				...line,
				...(update.description ? { description: update.description } : {}),
				...(update.amount !== undefined
					? { amount: atmnToStripeAmount({ amount: update.amount, currency }) }
					: {}),
			};
		});

	const adds = edits.add ?? [];
	const customAdds = adds
		.filter((entry): entry is CustomLineItem => !isCatalogPlan(entry))
		.map(
			(entry): StripeLine => ({
				description: entry.description,
				amount: atmnToStripeAmount({ amount: entry.amount, currency }),
				discountable: false,
			}),
		);
	const planAdds = await computeReissueCatalogLines({
		ctx,
		customerId,
		currency,
		plans: adds.filter(isCatalogPlan),
	});

	return [...kept, ...customAdds, ...planAdds];
};
