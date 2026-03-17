import { useStdout } from "ink";

/**
 * Chrome heights for different layout configurations.
 * 
 * Base chrome (always present):
 * - TitleBar with border: 3 lines (top border + content + bottom border)
 * - marginTop before content: 1 line
 * - Table border (top + bottom): 2 lines
 * - Table header: 1 line
 * - marginTop before BottomBar: 1 line
 * - BottomBar with border: 3 lines (top border + content + bottom border)
 * Total: 11 lines
 */
const BASE_CHROME = 11;

/**
 * Additional chrome when search input is open:
 * - marginTop before SearchInput: 1 line
 * - SearchInput with border: 3 lines (top border + content + bottom border)
 * Total: 4 lines
 */
const SEARCH_CHROME = 4;

/**
 * Additional chrome when side sheet is open:
 * This doesn't affect row count, just width allocation.
 */

export interface UseVisibleRowCountOptions {
	/** Whether search input is currently open */
	searchOpen?: boolean;
	/** Minimum rows to show (default: 3) */
	minRows?: number;
}

/**
 * Hook that calculates how many table rows can fit in the current terminal.
 * 
 * @param options - Configuration options
 * @returns The number of rows that can be displayed
 */
export function useVisibleRowCount(options: UseVisibleRowCountOptions = {}): number {
	const { searchOpen = false, minRows = 3 } = options;
	const { stdout } = useStdout();
	
	const terminalRows = stdout?.rows ?? 24;
	const chrome = BASE_CHROME + (searchOpen ? SEARCH_CHROME : 0);
	
	return Math.max(minRows, terminalRows - chrome);
}

/**
 * Non-hook version for use outside React components.
 * Uses process.stdout directly.
 */
export function getVisibleRowCount(options: UseVisibleRowCountOptions = {}): number {
	const { searchOpen = false, minRows = 3 } = options;
	
	const terminalRows = process.stdout.rows ?? 24;
	const chrome = BASE_CHROME + (searchOpen ? SEARCH_CHROME : 0);
	
	return Math.max(minRows, terminalRows - chrome);
}
