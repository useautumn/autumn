import { useState, useEffect } from "react";

export interface TerminalSize {
	rows: number;
	columns: number;
}

export function useTerminalSize(): TerminalSize {
	const [size, setSize] = useState<TerminalSize>({
		rows: process.stdout.rows ?? 24,
		columns: process.stdout.columns ?? 80,
	});

	useEffect(() => {
		const handleResize = () => {
			setSize({
				rows: process.stdout.rows ?? 24,
				columns: process.stdout.columns ?? 80,
			});
		};

		process.stdout.on("resize", handleResize);
		return () => {
			process.stdout.off("resize", handleResize);
		};
	}, []);

	return size;
}
