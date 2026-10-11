import { LoadTestSystemNode } from "./loadTestSystemNode";

export function LoadTestArchitecture() {
	return (
		<figure className="not-prose my-8">
			<div className="overflow-x-auto">
				<svg
					viewBox="0 0 720 356"
					role="img"
					aria-label="Production logs in Axiom become an S3 traffic snapshot. Modal runners replay it through the staging load balancer to the API and balance workers. A production database backup is copied and cleaned into the staging database. Staging also has its own cache and Kafka, and outputs logs and metrics for analysis."
					className="mx-auto block h-auto w-full min-w-[680px] font-sans"
				>
					<title>Our load-test environment</title>
					<path
						d="M 437 12 Q 565 10 710 13 L 711 341 Q 575 344 436 341 Z"
						fill="#141414"
						fillOpacity="0.4"
						stroke="#525252"
						strokeDasharray="5 6"
					/>
					<text
						x="454"
						y="34"
						fill="#a3a3a3"
						fontSize="12"
						className="font-mono"
					>
						STAGING
					</text>

					<g
						fill="none"
						stroke="#a3a3a3"
						strokeWidth="1.4"
						strokeLinecap="round"
						strokeLinejoin="round"
					>
						<path d="M 105 98 Q 114 96 124 98 M 118 92 L 124 98 L 118 104" />
						<path d="M 251 98 Q 260 96 270 98 M 264 92 L 270 98 L 264 104" />
						<path
							d="M 405 98 Q 429 96 454 98 M 447 92 L 454 98 L 447 104"
							stroke="#9564ff"
						/>
						<path
							d="M 499 98 Q 514 96 530 98 M 524 92 L 530 98 L 524 104"
							stroke="#9564ff"
						/>
						<path d="M 618 151 Q 620 162 618 177 M 612 170 L 618 177 L 624 170" />
						<path
							d="M 196 228 Q 360 225 540 228 M 533 222 L 540 228 L 533 234"
							strokeDasharray="4 5"
						/>
					</g>

					<LoadTestSystemNode
						x={4}
						y={52}
						width={96}
						label="Axiom"
						detail="Prod logs"
						kind="logs"
					/>
					<LoadTestSystemNode
						x={130}
						y={52}
						width={116}
						label="Snapshot"
						detail="S3"
						kind="snapshot"
					/>
					<LoadTestSystemNode
						x={276}
						y={52}
						width={124}
						label="Modal runners"
						detail="Traffic ×N"
						kind="runners"
						accent
					/>
					<LoadTestSystemNode
						x={538}
						y={52}
						width={160}
						label="Staging app"
						detail="API + balance workers"
						kind="servers"
					/>

					<g
						transform="translate(478 98)"
						fill="none"
						stroke="#a3a3a3"
						strokeWidth="1.4"
						strokeLinecap="round"
						strokeLinejoin="round"
					>
						<path d="M -17 0 L -6 0 M -6 -12 L -6 12 M -6 -12 L 15 -12 M -6 0 L 15 0 M -6 12 L 15 12 M 10 -16 L 15 -12 L 10 -8 M 10 -4 L 15 0 L 10 4 M 10 8 L 15 12 L 10 16" />
					</g>
					<text
						x="478"
						y="131"
						textAnchor="middle"
						fill="#a3a3a3"
						fontSize="12"
					>
						ALB
					</text>

					<LoadTestSystemNode
						x={44}
						y={184}
						width={144}
						label="Production DB"
						detail="PlanetScale"
						kind="database"
					/>
					<LoadTestSystemNode
						x={546}
						y={184}
						width={144}
						label="Staging DB"
						detail="Postgres"
						kind="database"
					/>
					<text
						x="355"
						y="214"
						textAnchor="middle"
						fill="#a3a3a3"
						fontSize="13"
					>
						PITR copy + clean
					</text>
					<text
						x="355"
						y="254"
						textAnchor="middle"
						fill="#737373"
						fontSize="12"
					>
						Same point in time
					</text>

					<g
						fill="none"
						stroke="#a3a3a3"
						strokeWidth="1.2"
						strokeLinecap="round"
						strokeLinejoin="round"
					>
						<path d="M 465 302 L 483 302 L 483 320 L 465 320 Z M 470 307 L 478 307 L 478 315 L 470 315 Z M 469 298 L 469 302 M 479 298 L 479 302 M 469 320 L 469 324 M 479 320 L 479 324" />
						<path d="M 583 300 L 611 300 M 583 322 L 611 322 M 585 305 L 594 305 L 594 317 L 585 317 Z M 600 305 L 609 305 L 609 317 L 600 317 Z" />
					</g>
					<text x="493" y="316" fill="#a3a3a3" fontSize="14">
						Cache
					</text>
					<text x="620" y="316" fill="#a3a3a3" fontSize="14">
						Kafka
					</text>
					<g
						fill="none"
						stroke="#9564ff"
						strokeWidth="1.4"
						strokeLinecap="round"
						strokeLinejoin="round"
					>
						<path d="M 436 312 Q 406 310 376 312 M 383 306 L 376 312 L 383 318" />
						<path d="M 214 313 L 222 313 L 228 302 L 235 321 L 242 311 L 250 311" />
					</g>
					<text x="263" y="317" fill="#d4d4d4" fontSize="14">
						Logs + metrics
					</text>
				</svg>
			</div>
		</figure>
	);
}
