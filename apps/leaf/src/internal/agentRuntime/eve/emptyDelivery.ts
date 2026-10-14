export const EVE_EMPTY_DELIVERY_SENTINEL = "<eve-empty-delivery/>";
const ESCAPED_EMPTY_DELIVERY_SENTINEL = "&lt;eve-empty-delivery/&gt;";

export const isEmptyDelivery = (text: string | null | undefined) =>
	text === null ||
	(text ?? "").includes(EVE_EMPTY_DELIVERY_SENTINEL) ||
	(text ?? "").includes(ESCAPED_EMPTY_DELIVERY_SENTINEL);
