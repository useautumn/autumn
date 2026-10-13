import type { ReactNode } from "react";

const icons: Record<string, ReactNode> = {
	logs: (
		<path d="M -15 -12 L 15 -11 L 14 13 L -14 12 Z M -8 -5 L 8 -5 M -8 1 L 8 1 M -8 7 L 3 7" />
	),
	snapshot: (
		<path d="M -13 -14 L 4 -14 L 14 -4 L 13 14 L -13 13 Z M 4 -14 L 4 -4 L 14 -4 M -6 3 L 7 3 M -6 8 L 4 8" />
	),
	runners: (
		<path d="M -12 -14 L 17 -14 L 17 7 M -16 -9 L 12 -9 L 12 12 M -20 -4 L 7 -4 L 7 17 L -20 17 Z M -14 3 L -9 7 L -14 11 M -5 11 L 0 11" />
	),
	balancer: (
		<path d="M -17 0 L -6 0 M -6 -12 L -6 12 M -6 -12 L 15 -12 M -6 0 L 15 0 M -6 12 L 15 12 M 10 -16 L 15 -12 L 10 -8 M 10 -4 L 15 0 L 10 4 M 10 8 L 15 12 L 10 16" />
	),
	servers: (
		<path d="M -18 -14 L 18 -14 L 18 -2 L -18 -2 Z M -18 3 L 18 3 L 18 15 L -18 15 Z M -12 -8 L -9 -8 M -12 9 L -9 9 M -3 -8 L 12 -8 M -3 9 L 12 9" />
	),
	cache: (
		<path d="M -13 -12 L 13 -12 L 13 12 L -13 12 Z M -6 -5 L 6 -5 L 6 5 L -6 5 Z M -7 -18 L -7 -12 M 7 -18 L 7 -12 M -7 12 L -7 18 M 7 12 L 7 18 M -19 -6 L -13 -6 M -19 6 L -13 6 M 13 -6 L 19 -6 M 13 6 L 19 6" />
	),
	queue: (
		<path d="M -23 -13 L 23 -13 M -23 13 L 23 13 M -19 -7 L -9 -7 L -9 7 L -19 7 Z M -5 -7 L 5 -7 L 5 7 L -5 7 Z M 9 -7 L 19 -7 L 19 7 L 9 7 Z" />
	),
};

export function LoadTestSystemNode({
	x,
	y,
	width = 156,
	label,
	detail,
	kind,
	accent = false,
}: {
	x: number;
	y: number;
	width?: number;
	label: string;
	detail: string;
	kind:
		| "database"
		| "logs"
		| "snapshot"
		| "runners"
		| "balancer"
		| "servers"
		| "cache"
		| "queue";
	accent?: boolean;
}) {
	const stroke = accent ? "#9564ff" : "#737373";
	return (
		<g transform={`translate(${x} ${y})`}>
			{kind === "database" ? (
				<g fill="#141414" stroke={stroke} strokeWidth="1.3">
					<path
						d={`M 2 14 C 2 -2 ${width - 2} -2 ${width - 2} 14 L ${width - 2} 77 C ${width - 2} 94 2 94 2 77 Z`}
					/>
					<path
						d={`M 2 14 C 2 31 ${width - 2} 31 ${width - 2} 14`}
						fill="none"
					/>
					<path
						d={`M 5 16 C 5 31 ${width - 5} 32 ${width - 4} 16`}
						fill="none"
						opacity="0.35"
					/>
				</g>
			) : (
				<>
					<path
						d={`M 8 2 Q ${width / 2} 0 ${width - 8} 3 Q ${width - 1} 3 ${width - 2} 12 L ${width - 3} 83 Q ${width - 3} 91 ${width - 11} 90 L 9 89 Q 1 89 2 81 L 1 12 Q 0 3 8 2 Z`}
						fill="#141414"
						stroke={stroke}
						strokeWidth="1.3"
					/>
					<path
						d={`M 5 6 Q ${width / 2} 2 ${width - 6} 6 M ${width - 5} 11 L ${width - 6} 85 M 8 86 Q ${width / 2} 91 ${width - 9} 87`}
						fill="none"
						stroke={stroke}
						strokeWidth="0.6"
						opacity="0.45"
					/>
					<g
						transform={`translate(${width / 2} 25)`}
						fill="none"
						stroke={accent ? "#b08aff" : "#a3a3a3"}
						strokeWidth="1.3"
						strokeLinecap="round"
						strokeLinejoin="round"
					>
						{icons[kind]}
					</g>
				</>
			)}
			<text
				x={width / 2}
				y={kind === "database" ? 53 : 61}
				textAnchor="middle"
				fill="#e5e5e5"
				fontSize="16"
			>
				{label}
			</text>
			<text
				x={width / 2}
				y={kind === "database" ? 74 : 80}
				textAnchor="middle"
				fill="#a3a3a3"
				fontSize="12"
			>
				{detail}
			</text>
		</g>
	);
}
