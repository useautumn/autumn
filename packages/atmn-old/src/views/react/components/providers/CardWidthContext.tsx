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
	width: number;
	registerWidth: (id: string, contentWidth: number) => void;
	unregisterWidth: (id: string) => void;
}

const CardWidthContext = createContext<CardWidthContextValue | null>(null);

interface CardWidthProviderProps {
	children: ReactNode;
	minWidth?: number;
}

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

export function useCardWidth(): CardWidthContextValue | null {
	return useContext(CardWidthContext);
}
