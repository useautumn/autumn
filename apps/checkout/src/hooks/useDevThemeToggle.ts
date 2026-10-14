import { useEffect } from "react";
import { useTheme } from "@/components/theme-provider";

export function useDevThemeToggle() {
	const { theme, setTheme } = useTheme();

	useEffect(() => {
		if (import.meta.env.MODE !== "development") return;

		const handleKeyDown = (e: KeyboardEvent) => {
			if (
				e.target instanceof HTMLInputElement ||
				e.target instanceof HTMLTextAreaElement
			) {
				return;
			}

			if (e.key === "t") {
				const currentTheme =
					theme === "system"
						? window.matchMedia("(prefers-color-scheme: dark)").matches
							? "dark"
							: "light"
						: theme;

				setTheme(currentTheme === "dark" ? "light" : "dark");
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [theme, setTheme]);
}
