import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useMemo,
	useState,
} from "react";

const DEFAULT_MIN_WIDTH = 65;

interface CardWidthContextValue {
	/** The current shared width for all cards */
	width: number;
	/** Register a content width - cards call this to report their needed width */
	registerWidth: (id: string, contentWidth: number) => void;
	/** Unregister when card unmounts */
	unregisterWidth: (id: string) => void;
}

const CardWidthContext = createContext<CardWidthContextValue | null>(null);

interface CardWidthProviderProps {
	children: ReactNode;
	/** Minimum width for cards (default: 65) */
	minWidth?: number;
}

/**
 * Provider that coordinates card widths across all Card components.
 * Cards register their content widths, and all cards use the maximum.
 */
export function CardWidthProvider({
	children,
	minWidth = DEFAULT_MIN_WIDTH,
}: CardWidthProviderProps) {
	const [widthMap, setWidthMap] = useState<Map<string, number>>(new Map());

	const registerWidth = useCallback((id: string, contentWidth: number) => {
		setWidthMap((prev) => {
			const next = new Map(prev);
			next.set(id, contentWidth);
			return next;
		});
	}, []);

	const unregisterWidth = useCallback((id: string) => {
		setWidthMap((prev) => {
			const next = new Map(prev);
			next.delete(id);
			return next;
		});
	}, []);

	// Calculate the shared width: max of all registered widths, but at least minWidth
	const width = useMemo(() => {
		const maxContent = Math.max(0, ...Array.from(widthMap.values()));
		return Math.max(minWidth, maxContent);
	}, [widthMap, minWidth]);

	const value = useMemo(
		() => ({ width, registerWidth, unregisterWidth }),
		[width, registerWidth, unregisterWidth],
	);

	return (
		<CardWidthContext.Provider value={value}>
			{children}
		</CardWidthContext.Provider>
	);
}

/**
 * Hook to access the shared card width context.
 * Returns null if not inside a CardWidthProvider (cards will use default width).
 */
export function useCardWidth(): CardWidthContextValue | null {
	return useContext(CardWidthContext);
}
