import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
	ImportBlockedBanner,
	ImportCatalogFooter,
} from "../../../../src/views/products/catalog-transfer/components/ImportCatalogFooter";
import { isCatalogImportBlocked } from "../../../../src/views/products/catalog-transfer/utils/isCatalogImportBlocked";
import { parseCatalogImportJson } from "../../../../src/views/products/catalog-transfer/utils/parseCatalogImportJson";

const renderFooter = ({ blocked }: { blocked: boolean }) =>
	renderToStaticMarkup(
		<ImportCatalogFooter
			blocked={blocked}
			error={null}
			hasPreview={false}
			canPreview
			isPreviewing={false}
			isApplying={false}
			onCancel={() => {}}
			onPreview={() => {}}
			onApply={() => {}}
		/>,
	);

const disabledButtons = (markup: string) =>
	[...markup.matchAll(/<button[^>]*>/g)]
		.filter(([tag]) => /\sdisabled(=""|\s|>)/.test(tag))
		.map(([tag]) => tag);

describe("catalog import prod gate", () => {
	test("blocks only the production dashboard host", () => {
		expect(isCatalogImportBlocked({ hostname: "app.useautumn.com" })).toBe(
			true,
		);
		expect(isCatalogImportBlocked({ hostname: "localhost" })).toBe(false);
		expect(isCatalogImportBlocked({ hostname: "staging.useautumn.com" })).toBe(
			false,
		);
	});

	test("disables Preview and Apply but keeps Cancel on prod", () => {
		const markup = renderFooter({ blocked: true });
		expect(markup).toContain("Disabled on app.useautumn.com");
		expect(disabledButtons(markup)).toHaveLength(2);
		expect(renderToStaticMarkup(<ImportBlockedBanner />)).toContain(
			"Import is disabled in production.",
		);
	});

	test("enables Preview off prod while Apply waits for a preview", () => {
		const markup = renderFooter({ blocked: false });
		expect(markup).toContain("Nothing is written until you Apply.");
		expect(disabledButtons(markup)).toHaveLength(1);
	});
});

describe("parseCatalogImportJson", () => {
	test("never forwards deletion flags or removal arrays", () => {
		const result = parseCatalogImportJson({
			text: JSON.stringify({
				plans: [{ plan_id: "pro" }],
				skip_deletions: false,
				skip_version_deletions: false,
				remove_plans: [{ plan_id: "legacy" }],
				remove_features: [{ feature_id: "old_feature" }],
			}),
		});
		expect(result).toEqual({ params: { plans: [{ plan_id: "pro" }] } });
	});

	test("reports invalid or non-object JSON", () => {
		expect(parseCatalogImportJson({ text: "{" })).toEqual({
			error: "Invalid JSON",
		});
		expect(parseCatalogImportJson({ text: "[]" })).toHaveProperty("error");
		expect(parseCatalogImportJson({ text: "  " })).toEqual({ empty: true });
	});
});
