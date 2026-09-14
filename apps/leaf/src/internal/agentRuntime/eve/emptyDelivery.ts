/** Eve's conditional-delivery marker: a reply of exactly this means the model
 * chose to say nothing. Eve completes such a message with `message: null`,
 * and the marker itself still streams through message deltas. */
export const EVE_EMPTY_DELIVERY_SENTINEL = "<eve-empty-delivery/>";

export const isEmptyDelivery = (text: string | null | undefined) =>
	text === null || (text ?? "").includes(EVE_EMPTY_DELIVERY_SENTINEL);
