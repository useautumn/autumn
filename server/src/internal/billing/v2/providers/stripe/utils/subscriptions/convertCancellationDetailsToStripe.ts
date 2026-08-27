export const STRIPE_CANCELLATION_FEEDBACKS = [
	"customer_service",
	"low_quality",
	"missing_features",
	"other",
	"switched_service",
	"too_complex",
	"too_expensive",
	"unused",
] as const;

export type StripeCancellationFeedback =
	(typeof STRIPE_CANCELLATION_FEEDBACKS)[number];

export type StripeCancellationDetailsParams = {
	comment?: string;
	feedback?: StripeCancellationFeedback;
};

export type CancellationDetailsInput = {
	reason?: string;
	details?: string;
};

const isStripeCancellationFeedback = (
	reason: string,
): reason is StripeCancellationFeedback =>
	(STRIPE_CANCELLATION_FEEDBACKS as readonly string[]).includes(reason);

export const convertCancellationDetailsToStripe = ({
	cancellationDetails,
}: {
	cancellationDetails?: CancellationDetailsInput;
}): StripeCancellationDetailsParams | undefined => {
	if (!cancellationDetails) return undefined;

	const { reason, details } = cancellationDetails;
	const feedback =
		reason && isStripeCancellationFeedback(reason) ? reason : undefined;
	const commentParts = [
		reason && !feedback ? reason : undefined,
		details,
	].filter((part): part is string => Boolean(part));
	const comment = commentParts.join(": ") || undefined;

	if (!feedback && !comment) return undefined;

	return {
		...(feedback && { feedback }),
		...(comment && { comment }),
	};
};
