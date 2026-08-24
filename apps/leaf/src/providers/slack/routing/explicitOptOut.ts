const explicitOptOutPattern =
	/^(?:stop\s+(?:replying|responding|listening|watching)(?:\s+(?:to|in)\s+(?:this|the)\s+thread)?|(?:do not|don't|dont|never)\s+(?:reply|respond|listen|watch)(?:\s+(?:anymore|again))?|leave\s+(?:this|the)\s+thread|unsubscribe(?:\s+from\s+(?:this|the)\s+thread)?)(?:\s+(?:now|please))?[.!?]*$/i;

export const isExplicitOptOut = (text: string) =>
	explicitOptOutPattern.test(
		text
			.trim()
			.replace(/^(?:hey|hi)\s+/i, "")
			.replace(
				/^(?:<@[^>]+>|@[UW][A-Z0-9]{4,}|@?autumn(?:\s+chat(?:\s+local)?)?|(?:this|the)\s+bot)[,:\s-]*/i,
				"",
			)
			.replace(
				/^(?:please\s+|(?:can|could|would)\s+you\s+(?:please\s+)?)/i,
				"",
			),
	);
