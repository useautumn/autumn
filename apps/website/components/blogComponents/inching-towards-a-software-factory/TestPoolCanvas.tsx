import { TestPoolFile } from "./TestPoolFile";
import {
	ATTEMPTS,
	DISPATCH_MS,
	END_MS,
	FAILED,
	getPoolState,
	POOL_LAYOUT,
	progress,
	RESULT_MS,
	RETRY,
	slotPosition,
	TEST_COUNT,
	WORKER_READY_MS,
} from "./testPoolSimulation";

const PURPLE = "#ad85ec";
const AMBER = "#c59a59";
const DIM = "#34303d";

export function TestPoolCanvas({ time }: { time: number }) {
	const { passed, queued, retrying } = getPoolState(time);
	const ready = time >= 1800;
	const done = time >= END_MS;
	const failedSlot = slotPosition(FAILED);
	const retrySlot = slotPosition(RETRY);
	const retryProgress = progress(time, RETRY.start, DISPATCH_MS);
	const retryX = failedSlot.x + (retrySlot.x - failedSlot.x) * retryProgress;
	const retryY = failedSlot.y + Math.sin(retryProgress * Math.PI) * 155;
	const nextQueued = queued.slice(0, 7);

	return (
		<svg
			viewBox={`0 0 ${POOL_LAYOUT.width} ${POOL_LAYOUT.height}`}
			className="block h-auto w-full"
			role="img"
			aria-label="A snapshot starts three workers. Tests move from a queue into worker slots and then into results. One failed test retries on a different worker."
		>
			<title>Illustrative parallel test run with one retry</title>
			<g
				fontFamily="var(--font-geist-mono), monospace"
				fontSize="10"
				fill="#a49eaf"
			>
				<text x="240" y="35" fill="#e5e5e5" fontSize="12">
					Test queue
				</text>
				<text x="675" y="35" textAnchor="end">
					{queued.length} remaining
				</text>
				<path d="M240 48H680M240 116H680" stroke="#292929" />
				{nextQueued.map((attempt, i) => (
					<TestPoolFile
						key={attempt.id}
						x={250 + i * 59}
						y={62}
						label={String(attempt.id + 1).padStart(2, "0")}
						tone="idle"
						opacity={1 - i * 0.1}
					/>
				))}
				{queued.length === 0 && (
					<text x="460" y="86" textAnchor="middle" fill="#686271">
						queue empty
					</text>
				)}

				<text x="26" y="165" fill="#e5e5e5" fontSize="12">
					Snapshot
				</text>
				<text x="206" y="165" fill="#e5e5e5" fontSize="12">
					Worker pool
				</text>
				<text x="752" y="165" fill="#e5e5e5" fontSize="12">
					Results
				</text>

				{/* Connectors stop at the cards, so no line passes through their content. */}
				<path
					d="M168 270H206M698 270H752"
					stroke={ready ? PURPLE : DIM}
					fill="none"
				/>
				<path
					d="M201 267L206 270L201 273M747 267L752 270L747 273"
					stroke={ready ? PURPLE : DIM}
					fill="none"
				/>
				{POOL_LAYOUT.workerX.map((x, worker) => (
					<path
						key={x}
						d={`M${x + 66} 116V146H${x + 70}V186`}
						fill="none"
						stroke={time >= WORKER_READY_MS[worker] ? "#5b476f" : DIM}
					/>
				))}
				<path
					d={`M${failedSlot.x + 16} 354V398H${retrySlot.x + 16}V354`}
					fill="none"
					stroke={retrying ? AMBER : DIM}
					strokeDasharray="3 4"
				/>
				<text
					x="462"
					y="418"
					textAnchor="middle"
					fill={retrying ? AMBER : "#686271"}
				>
					retry ×1 · different worker
				</text>

				{[12, 6, 0].map((offset) => (
					<rect
						key={offset}
						x={26 - offset}
						y={192 + offset}
						width="142"
						height="162"
						rx="4"
						fill="#111015"
						stroke={ready ? "#624482" : DIM}
					/>
				))}
				<rect
					x="77"
					y="217"
					width="40"
					height="36"
					rx="3"
					fill="#21172e"
					stroke={ready ? PURPLE : DIM}
				/>
				<path
					d="M97 228L104 235L97 242L90 235ZM97 232L100 235L97 238L94 235Z"
					fill="none"
					stroke={ready ? PURPLE : "#68557d"}
				/>
				<rect
					x="38"
					y="285"
					width="118"
					height="24"
					fill="#18131f"
					stroke={DIM}
				/>
				<text x="97" y="301" textAnchor="middle" fill="#e5e5e5">
					Autumn
				</text>
				{["DB", "cache", "queues"].map((label, i) => (
					<g key={label}>
						<rect
							x={38 + i * 40}
							y="318"
							width="36"
							height="21"
							rx="2"
							fill="#101014"
							stroke={time >= 450 + i * 500 ? PURPLE : DIM}
						/>
						<text
							x={56 + i * 40}
							y="332"
							textAnchor="middle"
							fontSize="8"
							fill={time >= 450 + i * 500 ? "#dcc4ff" : "#686271"}
						>
							{label}
						</text>
					</g>
				))}

				<rect
					x="206"
					y="178"
					width="492"
					height="190"
					rx="4"
					fill="#100e14"
					stroke="#292431"
				/>
				{POOL_LAYOUT.workerX.map((x, worker) => {
					const assigned = ATTEMPTS.filter(
						(attempt) => attempt.worker === worker,
					);
					const boot = progress(time, WORKER_READY_MS[worker] - 300, 300);
					const drained =
						time >=
						Math.max(...assigned.map((attempt) => attempt.end)) + RESULT_MS;
					const opacity = drained ? 0.48 : 0.35 + boot * 0.65;
					return (
						<g
							key={x}
							opacity={opacity}
							transform={`translate(0 ${4 * (1 - boot)})`}
						>
							<rect
								x={x}
								y="192"
								width="140"
								height="162"
								rx="3"
								fill="#141117"
								stroke={boot === 1 && !drained ? "#655078" : DIM}
							/>
							<text x={x + 12} y="213">
								0{worker + 1}
							</text>
							<circle
								cx={x + 126}
								cy="209"
								r="2"
								fill={boot === 1 && !drained ? PURPLE : DIM}
							/>
							{[0, 1, 2].map((slot) => {
								const attempt = assigned.find(
									(item) =>
										item.slot === slot &&
										time >= item.start + DISPATCH_MS &&
										time < item.end,
								);
								const slotX = x + 17 + slot * 40;
								return (
									<g key={slot}>
										<rect
											x={slotX}
											y="239"
											width="32"
											height="39"
											fill="none"
											stroke={DIM}
											strokeDasharray="2 3"
										/>
										{attempt && (
											<TestPoolFile
												x={slotX}
												y={239}
												tone={attempt.retry ? "retry" : "active"}
												label={String(attempt.id + 1).padStart(2, "0")}
											/>
										)}
										{attempt && (
											<rect
												x={slotX}
												y="283"
												width={
													32 *
													progress(
														time,
														attempt.start + DISPATCH_MS,
														attempt.end - attempt.start - DISPATCH_MS,
													)
												}
												height="2"
												fill={attempt.retry ? AMBER : PURPLE}
											/>
										)}
									</g>
								);
							})}
							<rect
								x={x + 12}
								y="295"
								width="116"
								height="22"
								fill="#1b1523"
								stroke={DIM}
							/>
							<text x={x + 70} y="310" textAnchor="middle" fill="#d4c7e3">
								Autumn
							</text>
							<text x={x + 70} y="337" fontSize="8" textAnchor="middle">
								DB · cache · queues
							</text>
						</g>
					);
				})}

				<rect
					x="752"
					y="192"
					width="128"
					height="162"
					rx="4"
					fill="#15101d"
					stroke={done ? PURPLE : DIM}
				/>
				<text x="766" y="214" fill="#dcc4ff">
					{passed.length}/{TEST_COUNT} passed
				</text>
				{ATTEMPTS.filter((attempt) => !attempt.retry).map(({ id }) => {
					let fill = "#27212f";
					if (id === FAILED.id && retrying) fill = AMBER;
					if (passed.some((attempt) => attempt.id === id)) fill = "#9564cc";
					return (
						<rect
							key={`result-${id}`}
							x={766 + (id % 8) * 12}
							y={231 + Math.floor(id / 8) * 14}
							width="9"
							height="10"
							rx="1"
							fill={fill}
						/>
					);
				})}
				<text x="766" y="299" fill={retrying ? AMBER : "#a49eaf"}>
					{time >= FAILED.end ? "↻ 1 retry" : "↻ 0 retries"}
				</text>
				<text x="766" y="321" fill={done ? PURPLE : "#686271"}>
					{done ? "✓ complete" : "collecting…"}
				</text>

				{ATTEMPTS.filter(
					(attempt) =>
						!attempt.retry &&
						time >= attempt.start &&
						time < attempt.start + DISPATCH_MS,
				).map((attempt) => {
					const p = progress(time, attempt.start, DISPATCH_MS);
					const destination = slotPosition(attempt);
					const sourceX = 250 + (attempt.id % 7) * 59;
					return (
						<TestPoolFile
							key={`dispatch-${attempt.id}`}
							x={sourceX + (destination.x - sourceX) * p}
							y={62 + (destination.y - 62) * p}
							tone="active"
							label={String(attempt.id + 1).padStart(2, "0")}
						/>
					);
				})}
				{time >= RETRY.start && time < RETRY.start + DISPATCH_MS && (
					<TestPoolFile x={retryX} y={retryY} tone="retry" label="retry" />
				)}
				{ATTEMPTS.filter(
					(attempt) => time >= attempt.end && time < attempt.end + RESULT_MS,
				).map((attempt) => {
					const p = progress(time, attempt.end, RESULT_MS);
					const source = slotPosition(attempt);
					return (
						<circle
							key={`result-${attempt.id}-${attempt.retry}`}
							cx={source.x + 16 + (770 - source.x - 16) * p}
							cy={source.y + 20 + (246 - source.y - 20) * p}
							r="3"
							fill={attempt.fails ? AMBER : PURPLE}
						/>
					);
				})}
			</g>
		</svg>
	);
}
