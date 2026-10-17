import { parsePreviewPayload } from "@autumn/render";
import type { PreviewPermission } from "@autumn/shared";
import { permissionDenialText } from "./permissionDenialText.js";

// Unwraps the display wrapper (`{ _display, preview }`) and MCP envelopes first.
const readPermission = ({
	preview,
}: {
	preview: unknown;
}): PreviewPermission | undefined =>
	parsePreviewPayload(preview)?.permission as PreviewPermission | undefined;

/** The denial text for a preview the rules deny this approver; a shadow-mode deny never stops one. */
const previewRuleDenial = ({
	preview,
}: {
	preview: unknown;
}): string | undefined => {
	const permission = readPermission({ preview });
	if (permission?.verdict !== "deny" || !permission.enforced) return undefined;
	return permissionDenialText({ denial: permission });
};

/** A grouped card runs only if every step passes, so the first denied step decides. */
export const firstRuleDenial = ({
	previews,
}: {
	previews: ReadonlyArray<unknown>;
}): string | undefined =>
	previews
		.map((preview) => previewRuleDenial({ preview }))
		.find((denial) => denial !== undefined);
