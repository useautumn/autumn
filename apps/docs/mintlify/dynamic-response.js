/**
 * Dynamic Response Example Script
 *
 * Patches the response example in the sidebar to switch between
 * snake_case and camelCase based on the selected code language.
 *
 * - TypeScript → camelCase (e.g., customerId)
 * - Python/cURL → snake_case (e.g., customer_id)
 */

(() => {
	// Convert snake_case to camelCase
	const toCamelCase = (str) =>
		str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());

	// Convert camelCase to snake_case
	const toSnakeCase = (str) =>
		str.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();

	// Store original keys for each span
	const originalKeysMap = new WeakMap();

	// Check if TypeScript is selected
	const isTypeScriptSelected = () => {
		try {
			const lang = localStorage.getItem("code");
			return JSON.parse(lang) === "typescript";
		} catch {
			return false;
		}
	};

	// Find response code groups (with "200" or "201" tabs)
	const findResponseCodeGroups = () => {
		const codeGroups = document.querySelectorAll(".code-group");
		const results = [];

		for (const codeGroup of codeGroups) {
			const tabs = codeGroup.querySelectorAll('[role="tab"]');
			for (const tab of tabs) {
				const text = tab.textContent.trim();
				if (text === "200" || text === "201") {
					// Check if it's on the right side (sidebar)
					const rect = codeGroup.getBoundingClientRect();
					if (rect.left > window.innerWidth / 2) {
						results.push(codeGroup);
					}
				}
			}
		}

		return results;
	};

	// Update response examples
	const updateResponseExamples = () => {
		const useCamelCase = isTypeScriptSelected();
		const codeGroups = findResponseCodeGroups();

		for (const codeGroup of codeGroups) {
			const codeElement = codeGroup.querySelector("code");
			if (!codeElement) continue;

			const spans = codeElement.querySelectorAll("span");

			for (const span of spans) {
				const text = span.textContent;

				// Match JSON keys with optional leading whitespace
				const keyMatch = text.match(/^(\s*)"([a-z][a-z0-9]*(?:_[a-z0-9]+)*)"$/);

				if (keyMatch) {
					const leadingWhitespace = keyMatch[1];
					const keyName = keyMatch[2];

					// Only process keys with underscores or camelCase
					if (keyName.includes("_") || /[a-z][A-Z]/.test(keyName)) {
						// Store original if not already stored
						if (!originalKeysMap.has(span)) {
							originalKeysMap.set(span, keyName);
						}

						const originalKey = originalKeysMap.get(span);
						const newKey = useCamelCase
							? toCamelCase(originalKey)
							: toSnakeCase(originalKey);

						if (keyName !== newKey) {
							span.textContent = `${leadingWhitespace}"${newKey}"`;
						}
					}
				}
			}
		}
	};

	// Listen for language changes
	document.addEventListener("mintlify-localstorage", (event) => {
		if (event.detail?.key === "code") {
			requestAnimationFrame(updateResponseExamples);
		}
	});

	// Poll as fallback
	let lastLang = localStorage.getItem("code");
	setInterval(() => {
		const currentLang = localStorage.getItem("code");
		if (currentLang !== lastLang) {
			lastLang = currentLang;
			updateResponseExamples();
		}
	}, 200);

	// Run IMMEDIATELY - no waiting
	updateResponseExamples();

	// Aggressive early execution
	const init = () => {
		updateResponseExamples();
		setTimeout(updateResponseExamples, 5);
		setTimeout(updateResponseExamples, 15);
		setTimeout(updateResponseExamples, 30);
		setTimeout(updateResponseExamples, 50);
		setTimeout(updateResponseExamples, 80);
	};

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", init);
	} else {
		init();
	}

	// Watch for DOM changes - no debounce, run immediately
	const observer = new MutationObserver(() => {
		updateResponseExamples();
	});

	observer.observe(document.body, { childList: true, subtree: true });
})();
