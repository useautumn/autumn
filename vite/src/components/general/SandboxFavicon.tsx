import { AppEnv } from "@autumn/shared";
import { useEffect } from "react";
import { sandboxColorValue } from "@/hooks/sandbox/sandboxDisplay";
import { useActiveSandbox } from "@/hooks/sandbox/useActiveSandbox";
import { useEnv } from "@/utils/envUtils";

const AUTUMN_MARK =
	"M10.7139 9.06887C9.77726 11.211 8.84052 13.3532 7.90386 15.4953C8.63795 16.4465 9.37205 17.3984 10.1061 18.3496C12.2827 15.537 14.4599 12.7244 16.637 9.91183L9.27077 22.9514C12.9161 20.7518 16.5615 18.5529 20.2069 16.3534V4.85034L10.7139 9.06887Z";

const sandboxFaviconHref = (color: string) =>
	`data:image/svg+xml,${encodeURIComponent(
		`<svg width="28" height="28" viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg"><rect width="28" height="28" rx="6" fill="${sandboxColorValue(color)}"/><path d="${AUTUMN_MARK}" fill="black"/></svg>`,
	)}`;

export const SandboxFavicon = () => {
	const env = useEnv();
	const activeSandbox = useActiveSandbox();
	const color =
		env === AppEnv.Sandbox ? (activeSandbox?.color ?? "blue") : undefined;

	useEffect(() => {
		if (!color) return;

		const favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
		if (!favicon) return;

		const originalHref = favicon.getAttribute("href");
		favicon.href = sandboxFaviconHref(color);

		return () => {
			if (originalHref) favicon.setAttribute("href", originalHref);
			else favicon.removeAttribute("href");
		};
	}, [color]);

	return null;
};
