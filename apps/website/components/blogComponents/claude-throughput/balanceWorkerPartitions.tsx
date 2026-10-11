const description =
	"Servers route each customer's tracks to the same balance worker partition. Within the highlighted partition, tracks are processed one at a time on one CPU core. Less CPU time per track means more throughput.";

export function BalanceWorkerPartitions() {
	return (
		<figure className="not-prose @container my-8 w-full min-w-0">
			<svg
				viewBox="0 0 720 356"
				role="img"
				aria-label={description}
				className="mx-auto hidden h-auto w-full max-w-2xl font-sans @[560px]:block"
			>
				<title>Tracks are serialized on a balance worker</title>
				<text
					x="515"
					y="22"
					textAnchor="middle"
					fill="#a3a3a3"
					fontSize="12"
					className="font-mono"
				>
					BALANCE WORKERS
				</text>
				<g
					fill="none"
					stroke="#737373"
					strokeWidth="1.4"
					strokeLinecap="round"
					strokeLinejoin="round"
				>
					<path d="M 159 188 L 210 188 L 210 66 Q 210 61 218 61 L 327 61 M 320 55 L 327 61 L 320 67" />
					<path d="M 210 188 L 210 303 Q 210 309 218 309 L 327 309 M 320 303 L 327 309 L 320 315" />
					<path
						d="M 159 188 Q 240 186 327 188 M 320 181 L 327 188 L 320 195"
						stroke="#9564ff"
					/>
				</g>
				<ServerNode x={20} y={145} />
				<QuietPartition x={335} y={39} width={360} label="Partition 1" />
				<SerializedPartition x={335} y={113} />
				<QuietPartition x={335} y={287} width={360} label="Partition 3" />
				<g textAnchor="middle" fill="#b08aff" fontSize="13">
					<text x="267" y="151">
						Same customer
					</text>
					<text x="267" y="169">
						same partition
					</text>
				</g>
				<text x="515" y="352" textAnchor="middle" fill="#b08aff" fontSize="14">
					Less CPU time per track → more throughput
				</text>
			</svg>
			<svg
				viewBox="0 0 376 430"
				role="img"
				aria-label={description}
				className="mx-auto block h-auto w-full max-w-[400px] font-sans @[560px]:hidden"
			>
				<title>Tracks are serialized on a balance worker</title>
				<ServerNode x={118} y={4} />
				<g
					fill="none"
					stroke="#737373"
					strokeWidth="1.4"
					strokeLinecap="round"
					strokeLinejoin="round"
				>
					<path d="M 188 97 L 188 122 M 93 138 L 93 129 Q 93 122 102 122 L 274 122 Q 283 122 283 129 L 283 138 M 87 131 L 93 138 L 99 131 M 277 131 L 283 138 L 289 131" />
					<path
						d="M 188 97 L 188 194 M 188 216 L 188 230 M 181 223 L 188 230 L 195 223"
						stroke="#9564ff"
					/>
				</g>
				<QuietPartition x={8} y={146} width={166} label="Partition 1" />
				<QuietPartition x={202} y={146} width={166} label="Partition 3" />
				<text x="188" y="209" textAnchor="middle" fill="#b08aff" fontSize="14">
					Same customer → same partition
				</text>
				<SerializedPartition x={8} y={238} />
				<text x="188" y="410" textAnchor="middle" fill="#b08aff" fontSize="15">
					Less CPU time per track → more throughput
				</text>
			</svg>
		</figure>
	);
}

function ServerNode({ x, y }: { x: number; y: number }) {
	return (
		<g transform={`translate(${x} ${y})`}>
			<path
				d="M 10 2 Q 69 0 130 3 Q 140 3 139 13 L 138 77 Q 139 87 128 87 Q 68 89 10 86 Q 1 86 2 77 L 1 12 Q 1 3 10 2 Z"
				fill="#141414"
				stroke="#737373"
				strokeWidth="1.3"
			/>
			<path
				d="M 6 6 Q 69 3 133 6 M 134 11 L 134 82 M 128 83 Q 69 86 6 82"
				fill="none"
				stroke="#737373"
				strokeWidth="0.6"
				opacity="0.5"
			/>
			<path
				d="M 51 17 L 89 17 L 89 29 L 51 29 Z M 51 35 L 89 35 L 89 47 L 51 47 Z M 57 23 L 62 23 M 57 41 L 62 41"
				fill="none"
				stroke="#a3a3a3"
				strokeWidth="1.5"
				strokeLinejoin="round"
			/>
			<text x="70" y="71" textAnchor="middle" fill="#e5e5e5" fontSize="18">
				Servers
			</text>
		</g>
	);
}

function QuietPartition({
	x,
	y,
	width,
	label,
}: {
	x: number;
	y: number;
	width: number;
	label: string;
}) {
	return (
		<g transform={`translate(${x} ${y})`}>
			<path
				d={`M 8 2 Q ${width / 2} 0 ${width - 8} 2 Q ${width - 1} 2 ${width - 2} 9 L ${width - 2} 36 Q ${width - 2} 43 ${width - 9} 42 L 9 42 Q 2 42 2 35 L 2 10 Q 1 2 8 2 Z`}
				fill="#141414"
				stroke="#525252"
				strokeWidth="1.2"
			/>
			<text
				x={width / 2}
				y="28"
				textAnchor="middle"
				fill="#a3a3a3"
				fontSize="15"
			>
				{label}
			</text>
		</g>
	);
}

function SerializedPartition({ x, y }: { x: number; y: number }) {
	return (
		<g transform={`translate(${x} ${y})`}>
			<path
				d="M 10 2 Q 181 0 349 3 Q 358 3 358 13 L 357 137 Q 358 146 348 146 Q 178 149 10 146 Q 1 146 2 137 L 1 12 Q 1 2 10 2 Z"
				fill="#141414"
				stroke="#9564ff"
				strokeWidth="1.4"
			/>
			<path
				d="M 7 6 Q 180 3 351 6 M 353 11 L 353 140 M 348 142 Q 180 145 7 142"
				fill="none"
				stroke="#9564ff"
				strokeWidth="0.6"
				opacity="0.5"
			/>
			<text x="20" y="29" fill="#e5e5e5" fontSize="17">
				Partition 2
			</text>
			{[22, 82, 142].map((xPosition) => (
				<g key={xPosition} transform={`translate(${xPosition} 57)`}>
					<path
						d="M 0 1 L 49 0 L 50 31 L 1 32 Z"
						fill="#9564ff"
						fillOpacity="0.08"
						stroke="#9564ff"
						strokeWidth="1.2"
					/>
					<text x="25" y="21" textAnchor="middle" fill="#d4d4d4" fontSize="14">
						track
					</text>
				</g>
			))}
			<g
				fill="none"
				stroke="#b08aff"
				strokeWidth="1.5"
				strokeLinecap="round"
				strokeLinejoin="round"
			>
				<path d="M 202 73 Q 221 72 242 73 M 235 66 L 242 73 L 235 80" />
				<path d="M 257 48 L 335 48 L 335 98 L 257 98 Z M 263 54 L 329 54 L 329 92 L 263 92 Z M 269 42 L 269 48 M 287 42 L 287 48 M 305 42 L 305 48 M 323 42 L 323 48 M 269 98 L 269 104 M 287 98 L 287 104 M 305 98 L 305 104 M 323 98 L 323 104 M 251 60 L 257 60 M 251 85 L 257 85 M 335 60 L 341 60 M 335 85 L 341 85" />
			</g>
			<text x="296" y="79" textAnchor="middle" fill="#e5e5e5" fontSize="16">
				1 core
			</text>
			<text x="180" y="129" textAnchor="middle" fill="#a3a3a3" fontSize="14">
				Tracks processed one at a time
			</text>
		</g>
	);
}
