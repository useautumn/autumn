const defaultSteps = [
	{ label: "Form a hypothesis", detail: "Bottleneck + fix" },
	{ label: "Run an experiment", detail: "Baseline vs fixed" },
	{ label: "Analyze results", detail: "Logs + metrics" },
];

export function ExperimentationLoop({
	steps = defaultSteps,
	showOutcomes = false,
	description = "Experimentation loop: form a hypothesis about the bottleneck and fix, run a baseline versus fixed experiment, analyze logs and metrics, then repeat.",
}: {
	steps?: { label: string; detail: string | string[] }[];
	showOutcomes?: boolean;
	description?: string;
}) {
	return (
		<figure className="not-prose my-8 overflow-x-auto">
			<svg
				viewBox={showOutcomes ? "0 0 660 250" : "0 0 660 200"}
				role="img"
				aria-label={description}
				className="mx-auto block h-auto w-full min-w-[520px] max-w-xl font-sans"
			>
				<title>The experimentation loop</title>
				<g
					fill="none"
					stroke="#a3a3a3"
					strokeWidth="1.5"
					strokeLinecap="round"
					strokeLinejoin="round"
				>
					<path d="M 207 64 Q 216 62 226 64 M 219 58 L 226 64 L 219 70" />
					<path d="M 433 64 Q 443 62 452 64 M 445 58 L 452 64 L 445 70" />
					{showOutcomes ? (
						<>
							<path d="M 556 118 Q 558 152 556 192 M 548 181 L 556 192 L 563 180" />
							<path
								d="M 557 140 C 556 163 545 172 515 172 Q 446 174 392 172 M 268 173 Q 216 175 147 172 C 112 173 102 159 104 118 M 96 129 L 104 118 L 111 130"
								stroke="#9564ff"
							/>
						</>
					) : (
						<path
							d="M 556 118 C 558 156 548 172 515 172 Q 446 174 372 172 M 287 173 Q 216 175 147 172 C 112 173 102 159 104 118 M 96 129 L 104 118 L 111 130"
							stroke="#9564ff"
						/>
					)}
				</g>
				<text
					x="330"
					y="178"
					textAnchor="middle"
					fill="#b08aff"
					fontSize={showOutcomes ? 14 : 16}
					className="font-mono"
				>
					{showOutcomes ? "Spike remains" : "Repeat"}
				</text>
				{showOutcomes ? (
					<g textAnchor="middle">
						<text x="556" y="213" fill="#e5e5e5" fontSize="16">
							Spike gone
						</text>
						<text x="556" y="235" fill="#a3a3a3" fontSize="14">
							Hypothesis supported
						</text>
					</g>
				) : null}
				{steps.map(({ label, detail }, index) => (
					<g key={label} transform={`translate(${12 + index * 226} 24)`}>
						<g transform={`rotate(${index % 2 === 0 ? -0.6 : 0.6} 92 40)`}>
							<path
								d="M 9 2 Q 86 0 175 3 Q 184 3 183 13 L 182 71 Q 183 80 173 79 Q 86 82 9 79 Q 1 79 2 70 L 1 12 Q 1 3 9 2 Z"
								fill="#141414"
								stroke="#737373"
								strokeWidth="1.3"
							/>
							<path
								d="M 5 5 Q 88 3 177 5 M 179 10 Q 184 42 179 75 M 173 77 Q 82 80 5 76 M 4 72 Q 1 42 5 9"
								fill="none"
								stroke="#737373"
								strokeWidth="0.6"
								opacity="0.5"
							/>
						</g>
						<text
							x="92"
							y={Array.isArray(detail) ? 26 : 35}
							textAnchor="middle"
							fill="#e5e5e5"
							fontSize="18"
						>
							{label}
						</text>
						<text
							x="92"
							y={Array.isArray(detail) ? 49 : 59}
							textAnchor="middle"
							fill="#a3a3a3"
							fontSize="15"
						>
							{Array.isArray(detail)
								? detail.map((line, lineIndex) => (
										<tspan key={line} x="92" dy={lineIndex === 0 ? 0 : 19}>
											{line}
										</tspan>
									))
								: detail}
						</text>
					</g>
				))}
			</svg>
		</figure>
	);
}
