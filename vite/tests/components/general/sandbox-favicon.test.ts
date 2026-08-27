import { describe, expect, test } from "bun:test";
import { sandboxFaviconHref } from "@/components/general/SandboxFavicon";

const faviconSvg = (color?: string) =>
	decodeURIComponent(sandboxFaviconHref(color).split(",")[1]);

describe("sandboxFaviconHref", () => {
	test("uses the canonical blue only for the default sandbox", () => {
		expect(faviconSvg()).toContain('fill="#0f9bff"');
		expect(faviconSvg("blue")).toContain('fill="#2b7fff"');
	});
});
