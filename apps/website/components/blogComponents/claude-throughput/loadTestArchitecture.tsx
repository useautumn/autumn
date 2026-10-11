import { LoadTestSystemNode } from "./loadTestSystemNode";

export function LoadTestArchitecture() {
	return (
		<figure className="not-prose @container my-8 w-full min-w-0">
			<div className="hidden @[680px]:block">
				<svg
					viewBox="0 0 720 356"
					role="img"
					aria-label="Production logs in Axiom become an S3 traffic snapshot. Modal runners replay it through the staging load balancer to the API and balance workers. A production database backup is copied and cleaned into the staging database. Staging also has its own cache and Kafka, and outputs logs and metrics for analysis."
					className="mx-auto block h-auto w-full font-sans"
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
			<MobileLoadTestArchitecture />
		</figure>
	);
}

function MobileLoadTestArchitecture() {
	return (
		<svg
			viewBox="0 0 360 718"
			role="img"
			aria-label="Axiom logs become an S3 snapshot, which Modal runners replay through the staging load balancer and app. A cleaned production backup becomes the staging database. Cache and Kafka are isolated in staging. Logs and metrics come out for analysis."
			className="mx-auto block h-auto w-full max-w-[320px] font-sans @[680px]:hidden"
		>
			<title>Our load-test environment</title>
			<path
				d="M 7 359 Q 171 357 352 360 L 353 657 Q 173 660 7 657 Z"
				fill="#141414"
				fillOpacity="0.4"
				stroke="#525252"
				strokeDasharray="5 6"
			/>
			<text x="22" y="382" fill="#a3a3a3" fontSize="13" className="font-mono">
				STAGING
			</text>
			<g
				fill="none"
				stroke="#a3a3a3"
				strokeWidth="1.4"
				strokeLinecap="round"
				strokeLinejoin="round"
			>
				<path d="M 84 108 Q 86 114 84 121 M 78 115 L 84 121 L 90 115" />
				<path d="M 84 222 Q 86 228 84 235 M 78 229 L 84 235 L 90 229" />
				<path
					d="M 84 337 Q 86 368 84 400 M 78 393 L 84 400 L 90 393"
					stroke="#9564ff"
				/>
				<path
					d="M 166 452 L 180 452 M 174 446 L 180 452 L 174 458"
					stroke="#9564ff"
				/>
				<path d="M 262 502 L 262 534 M 256 527 L 262 534 L 268 527" />
				<path
					d="M 275 220 L 275 241 M 275 302 L 275 334 Q 275 347 291 347 L 336 347 Q 350 347 350 363 L 350 584 L 344 584 M 349 578 L 344 584 L 349 590"
					strokeDasharray="4 5"
				/>
				<path
					d="M 180 664 L 180 690 M 174 683 L 180 690 L 186 683"
					stroke="#9564ff"
				/>
			</g>
			<LoadTestSystemNode
				x={12}
				y={12}
				width={144}
				label="Axiom"
				detail="Production logs"
				kind="logs"
			/>
			<LoadTestSystemNode
				x={12}
				y={126}
				width={144}
				label="Snapshot"
				detail="S3 · saved traffic"
				kind="snapshot"
			/>
			<LoadTestSystemNode
				x={12}
				y={240}
				width={144}
				label="Modal runners"
				detail="Replay traffic ×N"
				kind="runners"
				accent
			/>
			<LoadTestSystemNode
				x={200}
				y={126}
				width={148}
				label="Production DB"
				detail="PlanetScale"
				kind="database"
			/>
			<g textAnchor="middle" fill="#a3a3a3" fontSize="13">
				<text x="275" y="264">
					PITR copy
				</text>
				<text x="275" y="284">
					+ clean
				</text>
			</g>
			<LoadTestSystemNode
				x={14}
				y={406}
				width={148}
				label="Load balancer"
				detail="AWS ALB"
				kind="balancer"
			/>
			<LoadTestSystemNode
				x={184}
				y={406}
				width={156}
				label="Staging app"
				detail="API + balance workers"
				kind="servers"
			/>
			<LoadTestSystemNode
				x={184}
				y={540}
				width={156}
				label="Staging DB"
				detail="Cleaned prod copy"
				kind="database"
			/>
			<g
				fill="none"
				stroke="#a3a3a3"
				strokeWidth="1.3"
				strokeLinecap="round"
				strokeLinejoin="round"
			>
				<path d="M 31 541 L 51 541 L 51 561 L 31 561 Z M 37 547 L 45 547 L 45 555 L 37 555 Z M 35 537 L 35 541 M 47 537 L 47 541 M 35 561 L 35 565 M 47 561 L 47 565" />
				<path d="M 27 594 L 57 594 M 27 616 L 57 616 M 29 599 L 39 599 L 39 611 L 29 611 Z M 44 599 L 54 599 L 54 611 L 44 611 Z" />
			</g>
			<text x="68" y="556" fill="#d4d4d4" fontSize="16">
				Cache
			</text>
			<text x="68" y="611" fill="#d4d4d4" fontSize="16">
				Kafka
			</text>
			<text x="180" y="712" textAnchor="middle" fill="#b08aff" fontSize="16">
				Logs + metrics
			</text>
		</svg>
	);
}
