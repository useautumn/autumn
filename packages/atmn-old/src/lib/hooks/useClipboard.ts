import clipboard from "clipboardy";
import { useCallback, useState } from "react";

export interface UseClipboardOptions {
	feedbackDuration?: number;
}

export interface UseClipboardReturn {
	copy: (text: string) => Promise<boolean>;
	showingFeedback: boolean;
	error: Error | null;
}

export function useClipboard(
	options: UseClipboardOptions = {},
): UseClipboardReturn {
	const { feedbackDuration = 1500 } = options;
	const [showingFeedback, setShowingFeedback] = useState(false);
	const [error, setError] = useState<Error | null>(null);

	const copy = useCallback(
		async (text: string): Promise<boolean> => {
			try {
				await clipboard.write(text);
				setError(null);
				setShowingFeedback(true);

				setTimeout(() => {
					setShowingFeedback(false);
				}, feedbackDuration);

				return true;
			} catch (err) {
				const copyError =
					err instanceof Error ? err : new Error("Failed to copy to clipboard");
				setError(copyError);
				return false;
			}
		},
		[feedbackDuration],
	);

	return {
		copy,
		showingFeedback,
		error,
	};
}
