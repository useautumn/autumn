/** Eve's conditional-delivery marker: a reply carrying this means the model
 * chose to say nothing. Eve completes such a message with `message: null`,
 * and the marker itself still streams through message deltas. */
export const EVE_EMPTY_DELIVERY_SENTINEL = "<eve-empty-delivery/>";
const ESCAPED_EMPTY_DELIVERY_SENTINEL = "&lt;eve-empty-delivery/&gt;";

/** Mirrors Eve's own check (a substring match, escaped form included): Eve
 * already treats any reply containing the marker as empty, so Leaf must not
 * surface text Eve would have dropped. */
export const isEmptyDelivery = (text: string | null | undefined) =>
	text === null ||
	(text ?? "").includes(EVE_EMPTY_DELIVERY_SENTINEL) ||
	(text ?? "").includes(ESCAPED_EMPTY_DELIVERY_SENTINEL);
