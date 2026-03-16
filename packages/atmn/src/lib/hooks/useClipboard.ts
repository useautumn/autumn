import clipboard from "clipboardy";
import { useCallback, useState } from "react";

export interface UseClipboardOptions {
	/** Duration in ms to show feedback (default: 1500) */
	feedbackDuration?: number;
}

export interface UseClipboardReturn {
	/** Copy text to clipboard */
	copy: (text: string) => Promise<boolean>;
	/** Whether feedback is currently showing */
	showingFeedback: boolean;
	/** Last error if copy failed */
	error: Error | null;
}

/**
 * Cross-platform clipboard hook with feedback state
 */
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

				// Clear feedback after duration
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
