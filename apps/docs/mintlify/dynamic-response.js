(() => {
	const toCamelCase = (str) =>
		str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());

	const toSnakeCase = (str) =>
		str.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();

	const originalKeysMap = new WeakMap();

	const isTypeScriptSelected = () => {
		try {
			const lang = localStorage.getItem("code");
			return JSON.parse(lang) === "typescript";
		} catch {
			return false;
		}
	};

	const findResponseCodeGroups = () => {
		const codeGroups = document.querySelectorAll(".code-group");
		const results = [];

		for (const codeGroup of codeGroups) {
			const tabs = codeGroup.querySelectorAll('[role="tab"]');
			for (const tab of tabs) {
				const text = tab.textContent.trim();
				if (text === "200" || text === "201") {
					const rect = codeGroup.getBoundingClientRect();
					if (rect.left > window.innerWidth / 2) {
						results.push(codeGroup);
					}
				}
			}
		}

		return results;
	};

	const updateResponseExamples = () => {
		const useCamelCase = isTypeScriptSelected();
		const codeGroups = findResponseCodeGroups();

		for (const codeGroup of codeGroups) {
			const codeElement = codeGroup.querySelector("code");
			if (!codeElement) continue;

			const spans = codeElement.querySelectorAll("span");

			for (const span of spans) {
				const text = span.textContent;

				const keyMatch = text.match(/^(\s*)"([a-z][a-z0-9]*(?:_[a-z0-9]+)*)"$/);

				if (keyMatch) {
					const leadingWhitespace = keyMatch[1];
					const keyName = keyMatch[2];

					if (keyName.includes("_") || /[a-z][A-Z]/.test(keyName)) {
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

	document.addEventListener("mintlify-localstorage", (event) => {
		if (event.detail?.key === "code") {
			requestAnimationFrame(updateResponseExamples);
		}
	});

	let lastLang = localStorage.getItem("code");
	setInterval(() => {
		const currentLang = localStorage.getItem("code");
		if (currentLang !== lastLang) {
			lastLang = currentLang;
			updateResponseExamples();
		}
	}, 200);

	updateResponseExamples();

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

	const observer = new MutationObserver(() => {
		updateResponseExamples();
	});

	observer.observe(document.body, { childList: true, subtree: true });
})();
