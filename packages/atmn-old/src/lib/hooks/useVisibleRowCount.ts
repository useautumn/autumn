import { useStdout } from "ink";

const BASE_CHROME = 11;

const SEARCH_CHROME = 4;

export interface UseVisibleRowCountOptions {
	searchOpen?: boolean;
	minRows?: number;
}

export function useVisibleRowCount(options: UseVisibleRowCountOptions = {}): number {
	const { searchOpen = false, minRows = 3 } = options;
	const { stdout } = useStdout();
	
	const terminalRows = stdout?.rows ?? 24;
	const chrome = BASE_CHROME + (searchOpen ? SEARCH_CHROME : 0);
	
	return Math.max(minRows, terminalRows - chrome);
}

export function getVisibleRowCount(options: UseVisibleRowCountOptions = {}): number {
	const { searchOpen = false, minRows = 3 } = options;
	
	const terminalRows = process.stdout.rows ?? 24;
	const chrome = BASE_CHROME + (searchOpen ? SEARCH_CHROME : 0);
	
	return Math.max(minRows, terminalRows - chrome);
}
