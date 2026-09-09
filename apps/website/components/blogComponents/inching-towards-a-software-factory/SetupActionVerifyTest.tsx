import { Fragment } from "react";

const TOKEN_COLORS = {
	plain: "#d2ccdc",
	keyword: "#ae80ff",
	str: "#cbb2ef",
	num: "#c8a1ff",
	call: "#e1d6f0",
} as const;

type TokenKind = keyof typeof TOKEN_COLORS;
type Token = { kind: TokenKind; text: string };

const t = (text: string): Token => ({ kind: "plain", text });
const kw = (text: string): Token => ({ kind: "keyword", text });
const str = (text: string): Token => ({ kind: "str", text });
const num = (text: string): Token => ({ kind: "num", text });
const call = (text: string): Token => ({ kind: "call", text });

type Line = { n: number; tokens: Token[] };
type Segment =
	| { kind: "loose"; id: string; lines: Line[] }
	| { kind: "phase"; id: string; label: string; lines: Line[] };

const SEGMENTS: Segment[] = [
	{
		kind: "loose",
		id: "open",
		lines: [
			{
				n: 1,
				tokens: [
					t("test("),
					str('"overages are billed at the end of the cycle"'),
					t(", "),
					kw("async"),
					t(" () => {"),
				],
			},
			{
				n: 2,
				tokens: [
					t("  "),
					kw("const"),
					t(" customer = "),
					kw("await"),
					t(" "),
					call("initScenario"),
					t("({"),
				],
			},
		],
	},
	{
		kind: "phase",
		id: "setup",
		label: "Setup",
		lines: [
			{ n: 3, tokens: [t("    "), kw("setup"), t(": [")] },
			{ n: 4, tokens: [t("      s.customer(),")] },
			{
				n: 5,
				tokens: [
					t("      s.products({ id: "),
					str('"pro"'),
					t(", includedMessages: "),
					num("100"),
					t(","),
				],
			},
			{
				n: 6,
				tokens: [t("        overagePerMessage: "), num("0.1"), t(" }),")],
			},
			{ n: 7, tokens: [t("    ],")] },
		],
	},
	{
		kind: "phase",
		id: "action",
		label: "Action",
		lines: [
			{ n: 8, tokens: [t("    "), kw("actions"), t(": [")] },
			{
				n: 9,
				tokens: [t("      s.attach({ productId: "), str('"pro"'), t(" }),")],
			},
			{
				n: 10,
				tokens: [
					t("      s.track({ featureId: "),
					str('"messages"'),
					t(", value: "),
					num("150"),
					t(" }),"),
				],
			},
			{ n: 11, tokens: [t("      s.advanceToNextInvoice(),")] },
			{ n: 12, tokens: [t("    ],")] },
		],
	},
	{
		kind: "loose",
		id: "close-scenario",
		lines: [
			{ n: 13, tokens: [t("  });")] },
			{ n: 14, tokens: [t("")] },
		],
	},
	{
		kind: "phase",
		id: "verify",
		label: "Verify",
		lines: [
			{
				n: 15,
				tokens: [
					t("  expect(customer.latestInvoice.total).toBe("),
					num("25"),
					t(");"),
				],
			},
			{
				n: 16,
				tokens: [
					t("  expect(customer.latestInvoice.status).toBe("),
					str('"paid"'),
					t(");"),
				],
			},
		],
	},
	{ kind: "loose", id: "close-test", lines: [{ n: 17, tokens: [t("});")] }] },
];

export function SetupActionVerifyTest() {
	return (
		<figure
			aria-label="A test file split into three outlined regions: setup, action and verify"
			className="not-prose my-8"
		>
			<div className="overflow-hidden rounded-xl border border-[#292929] bg-[#0f0d13]">
				<div className="flex items-center gap-2.5 border-b border-[#232030] bg-[#151320] px-3 py-2.5 sm:px-4">
					<span className="rounded-[3px] bg-[#9564ff1f] px-1.5 py-[1px] font-mono text-[9px] font-medium tracking-[0.06em] text-[#bd96ff]">
						TS
					</span>
					<span className="font-mono text-[11px] text-[#bfb1ce] sm:text-[12px]">
						overages.test.ts
					</span>
					<div aria-hidden="true" className="ml-auto flex items-center gap-1.5">
						<span className="h-[7px] w-[7px] rounded-full bg-[#FFFFFF22]" />
						<span className="h-[7px] w-[7px] rounded-full bg-[#FFFFFF22]" />
						<span className="h-[7px] w-[7px] rounded-full bg-[#FFFFFF22]" />
					</div>
				</div>

				<div className="overflow-x-auto py-2.5 [scrollbar-width:thin]">
					<div
						className="grid min-w-max font-mono text-[10.5px] leading-[1.62] sm:text-[12.5px]"
						style={{ gridTemplateColumns: "auto 1fr" }}
					>
						{SEGMENTS.map((segment) => (
							<Fragment key={segment.id}>
								<div className="sticky left-0 z-10 flex items-center bg-[#0f0d13] pr-2.5 pl-3 sm:pr-4 sm:pl-4">
									{segment.kind === "phase" ? (
										<span className="whitespace-nowrap text-[#FFFFFF66]">
											{segment.label}
										</span>
									) : null}
								</div>

								<div className="py-[3px] pr-3 sm:pr-4">
									<div
										className={
											segment.kind === "phase"
												? "rounded-[6px] border border-[#2f2740] border-l-2 border-l-[#7d54b5] bg-[#141020] py-[3px]"
												: undefined
										}
									>
										{segment.lines.map((line) => (
											<div
												key={line.n}
												className="flex items-center whitespace-pre"
											>
												<span
													aria-hidden="true"
													className="w-[22px] shrink-0 pr-2 text-right tabular-nums text-[#6b6178] select-none sm:w-[26px] sm:pr-2.5"
												>
													{line.n}
												</span>
												<span className="pr-3">
													{line.tokens.map((token, i) => (
														<span
															// biome-ignore lint/suspicious/noArrayIndexKey: static token list
															key={i}
															style={{ color: TOKEN_COLORS[token.kind] }}
														>
															{token.text}
														</span>
													))}
												</span>
											</div>
										))}
									</div>
								</div>
							</Fragment>
						))}
					</div>
				</div>
			</div>
		</figure>
	);
}
