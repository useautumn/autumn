export function ClaudeLoadTestLoop() {
	return (
		<figure className="not-prose @container my-8 w-full min-w-0">
			<ClaudeLoadTestMobileLoop />
			<svg
				viewBox="0 0 720 300"
				role="img"
				aria-label="Claude uses MCP to deploy code, tune infrastructure and run load tests in the load testing environment. Results, logs and metrics return to Claude to guide the next experiment."
				className="mx-auto hidden h-auto w-full max-w-2xl font-sans @[560px]:block"
			>
				<title>Claude drives the load testing loop</title>
				<g
					fill="none"
					strokeWidth="1.5"
					strokeLinecap="round"
					strokeLinejoin="round"
				>
					<path
						d="M 94 113 L 94 83 Q 93 60 117 60 Q 278 58 446 60 Q 471 60 470 83 L 470 92 M 463 84 L 470 92 L 477 84"
						stroke="#9564ff"
					/>
					<path
						d="M 470 237 L 470 246 Q 472 269 448 269 Q 279 271 118 269 Q 94 270 94 246 L 94 221 M 87 229 L 94 221 L 101 229"
						stroke="#a3a3a3"
					/>
				</g>
				<g textAnchor="middle">
					<text
						x="282"
						y="24"
						fill="#a3a3a3"
						fontSize="12"
						className="font-mono"
					>
						via MCP
					</text>
					<text x="282" y="46" fill="#b08aff" fontSize="16">
						Deploy · Tune · Run
					</text>
					<text x="282" y="294" fill="#a3a3a3" fontSize="15">
						Results · Logs · Metrics
					</text>
				</g>

				<path
					d="M 35 123 Q 93 120 153 123 Q 164 123 164 134 L 163 201 Q 164 212 152 212 Q 93 214 35 211 Q 24 211 25 200 L 24 134 Q 24 123 35 123 Z"
					fill="#141414"
					stroke="#737373"
					strokeWidth="1.3"
				/>
				<path
					d="M 30 127 Q 94 123 158 127 M 159 131 L 159 207 M 153 208 Q 94 211 30 207"
					fill="none"
					stroke="#737373"
					strokeWidth="0.6"
					opacity="0.5"
				/>
				<g
					fill="none"
					stroke="#b08aff"
					strokeWidth="1.5"
					strokeLinecap="round"
					strokeLinejoin="round"
				>
					<path d="M 79 141 L 110 141 L 110 163 L 79 163 Z M 85 147 L 91 152 L 85 157 M 96 157 L 103 157" />
				</g>
				<text x="94" y="192" textAnchor="middle" fill="#e5e5e5" fontSize="20">
					Claude
				</text>

				<path
					d="M 257 102 Q 471 99 704 102 L 704 227 Q 477 230 256 227 Z"
					fill="#141414"
					fillOpacity="0.4"
					stroke="#525252"
					strokeDasharray="5 6"
				/>
				<text
					x="480"
					y="127"
					textAnchor="middle"
					fill="#a3a3a3"
					fontSize="12"
					className="font-mono"
				>
					LOAD TESTING ENVIRONMENT
				</text>
				<g
					fill="none"
					stroke="#a3a3a3"
					strokeWidth="1.5"
					strokeLinecap="round"
					strokeLinejoin="round"
				>
					<path d="M 310 147 L 350 147 L 350 159 L 310 159 Z M 310 166 L 350 166 L 350 178 L 310 178 Z M 316 153 L 319 153 M 326 153 L 343 153 M 316 172 L 319 172 M 326 172 L 343 172" />
					<path d="M 460 147 L 500 147 L 500 178 L 460 178 Z M 475 154 L 487 163 L 475 171 Z" />
					<path d="M 610 146 L 610 179 L 651 179 M 616 168 L 624 168 L 631 151 L 639 172 L 646 161 L 652 161" />
				</g>
				<g textAnchor="middle" fill="#d4d4d4" fontSize="15">
					<text x="330" y="205">
						Infrastructure
					</text>
					<text x="480" y="205">
						Load tests
					</text>
					<text x="630" y="205">
						Observability
					</text>
				</g>
			</svg>
		</figure>
	);
}

function ClaudeLoadTestMobileLoop() {
	return (
		<svg
			viewBox="0 0 360 400"
			role="img"
			aria-label="Claude uses MCP to deploy code, tune infrastructure and run load tests. Results, logs and metrics return from the load testing environment to guide the next experiment."
			className="mx-auto block h-auto w-full max-w-[320px] font-sans @[560px]:hidden"
		>
			<title>Claude drives the load testing loop</title>
			<g
				fill="none"
				strokeWidth="1.5"
				strokeLinecap="round"
				strokeLinejoin="round"
			>
				<path
					d="M 94 121 Q 92 161 94 203 M 87 195 L 94 203 L 101 195"
					stroke="#9564ff"
				/>
				<path
					d="M 337 290 Q 351 290 351 275 L 350 90 Q 350 73 332 73 L 174 73 M 182 66 L 174 73 L 182 80"
					stroke="#a3a3a3"
				/>
			</g>
			<text x="111" y="157" fill="#b08aff" fontSize="16">
				Deploy · Tune · Run
			</text>
			<text x="111" y="179" fill="#a3a3a3" fontSize="12" className="font-mono">
				via MCP
			</text>
			<g textAnchor="middle" fill="#a3a3a3" fontSize="14">
				<text x="259" y="30">
					Results
				</text>
				<text x="259" y="51">
					Logs · Metrics
				</text>
			</g>
			<path
				d="M 35 24 Q 94 22 153 25 Q 164 25 164 36 L 163 101 Q 164 112 152 112 Q 94 114 35 111 Q 24 111 25 100 L 24 35 Q 24 24 35 24 Z"
				fill="#141414"
				stroke="#737373"
				strokeWidth="1.3"
			/>
			<path
				d="M 30 28 Q 94 25 158 28 M 159 32 L 159 107 M 153 108 Q 94 111 30 107"
				fill="none"
				stroke="#737373"
				strokeWidth="0.6"
				opacity="0.5"
			/>
			<path
				d="M 79 42 L 110 42 L 110 64 L 79 64 Z M 85 48 L 91 53 L 85 58 M 96 58 L 103 58"
				fill="none"
				stroke="#b08aff"
				strokeWidth="1.5"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<text x="94" y="93" textAnchor="middle" fill="#e5e5e5" fontSize="20">
				Claude
			</text>
			<path
				d="M 24 214 Q 175 211 336 214 L 336 385 Q 176 387 24 385 Z"
				fill="#141414"
				fillOpacity="0.4"
				stroke="#525252"
				strokeDasharray="5 6"
			/>
			<text
				x="180"
				y="242"
				textAnchor="middle"
				fill="#a3a3a3"
				fontSize="12"
				className="font-mono"
			>
				LOAD TESTING ENVIRONMENT
			</text>
			<g
				fill="none"
				stroke="#a3a3a3"
				strokeWidth="1.5"
				strokeLinecap="round"
				strokeLinejoin="round"
			>
				<path d="M 48 260 L 82 260 L 82 270 L 48 270 Z M 48 277 L 82 277 L 82 287 L 48 287 Z M 54 265 L 58 265 M 54 282 L 58 282" />
				<path d="M 48 304 L 82 304 L 82 331 L 48 331 Z M 60 310 L 72 317 L 60 325 Z" />
				<path d="M 48 346 L 48 374 L 84 374 M 53 365 L 59 365 L 65 350 L 72 368 L 78 358 L 84 358" />
			</g>
			<g fill="#d4d4d4" fontSize="17">
				<text x="103" y="281">
					Infrastructure
				</text>
				<text x="103" y="323">
					Load tests
				</text>
				<text x="103" y="367">
					Observability
				</text>
			</g>
		</svg>
	);
}
