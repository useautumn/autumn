import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./index.css";
import { ThemeProvider } from "./theme-provider";

const root = document.getElementById("root");
if (!root) {
	throw new Error("missing #root element");
}

createRoot(root).render(
	<StrictMode>
		<ThemeProvider defaultTheme="dark">
			<App />
		</ThemeProvider>
	</StrictMode>,
);
