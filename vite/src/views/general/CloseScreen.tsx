import { useEffect } from "react";
import LoadingScreen from "./LoadingScreen";

export const CloseScreen = () => {
	useEffect(() => {
		// Attempt to close immediately
		window.close();

		// If still open after 1 second, it means close() was blocked
		const timeout = setTimeout(() => {
			// Show the fallback UI
			const root = document.getElementById("root");
			if (root) {
				root.innerHTML = `
					<div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; gap: 16px;">
						<p style="font-size: 18px; color: #10b981;">✓ Connection successful!</p>
						<p style="color: #6b7280;">You can close this window now.</p>
					</div>
				`;
			}
		}, 1000);

		return () => clearTimeout(timeout);
	}, []);

	return (
		<div className="w-screen h-screen flex items-center justify-center">
			<LoadingScreen />
		</div>
	);
};
