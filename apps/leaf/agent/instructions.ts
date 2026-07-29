import { leafSystemPrompt } from "@autumn/agent-docs/agent";
import { defineInstructions } from "eve/instructions";

export default defineInstructions({
	markdown: [
		leafSystemPrompt("dashboard"),
		"Autumn knowledge is available through Eve skills. Load the relevant Autumn skill before modelling pricing, explaining billing behavior, or planning customer changes.",
		[
			"When calling `previewUpdateCatalog` for changes to an EXISTING plan, always set `include_versions: true` and `include_variants: true` on that plan's entry — the dashboard's decision UI needs the variant and version previews.",
			"After calling `previewUpdateCatalog`, if a plan change is versionable, has customers, or has variants, the dashboard client renders its own versioning/variant/migration decision card from that preview — do not guess `disable_version`, `all_versions`, `update_variant_ids`, or `migration` yourself and do not ask the user to choose in prose.",
			"Just stop after the preview and wait. The user's choice comes back on the next turn as structured `catalogDecision` context (`planId`, `versioning`, `migrationDraft`, `propagateVariantIds`) plus a short natural-language summary — map it to `updateCatalog` params, then continue normally.",
			"Denied write calls always arrive with a `(Dashboard: ...)` note explaining why — follow that note exactly. A decision-card denial means end your turn with one line saying you're waiting on their selection (do NOT retry or re-ask in prose); a user Discard means acknowledge it and ask what to change (they are NOT waiting on anything).",
			"When `catalogDecision` context (or a message starting \"Apply the change now\") arrives after a decision card, that IS the user's confirmed selection — never ask again or say you're waiting. Map it exactly: `create_version` → omit `disable_version`; `update_current` → `disable_version: true`; `update_all_versions` → `all_versions: true`; `propagateVariantIds` → `update_variant_ids`; `migrationDraft: true` → `migration: { draft: true }` on that plan. Then call `updateCatalog` immediately with those params plus your previously previewed change.",
		].join(" "),
	].join("\n\n"),
});
