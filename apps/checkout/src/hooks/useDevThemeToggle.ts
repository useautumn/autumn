import { useEffect } from "react";
import { useTheme } from "@/components/theme-provider";

/**
 * Dev-only hook that toggles dark/light mode when "t" is pressed.
 * Only active when NODE_ENV is "development".
 */
export function useDevThemeToggle() {
	const { theme, setTheme } = useTheme();

	useEffect(() => {
		if (import.meta.env.MODE !== "development") return;

		const handleKeyDown = (e: KeyboardEvent) => {
			// Ignore if typing in an input
			if (
				e.target instanceof HTMLInputElement ||
				e.target instanceof HTMLTextAreaElement
			) {
				return;
			}

			if (e.key === "t") {
				// Get the actual applied theme (resolve "system" to actual value)
				const currentTheme =
					theme === "system"
						? window.matchMedia("(prefers-color-scheme: dark)").matches
							? "dark"
							: "light"
						: theme;

				// Toggle to the opposite
				setTheme(currentTheme === "dark" ? "light" : "dark");
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [theme, setTheme]);
}
