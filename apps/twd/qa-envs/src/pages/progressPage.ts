import { escapeHtml } from "./escapeHtml";

/** Live build log for an env that is still being created; polls /__qa_progress. */
export const progressPage = ({ name, sha }: { name: string; sha: string }) =>
	new Response(
		`<!doctype html><html><head><meta charset="utf-8"><title>Building ${escapeHtml(name)}…</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font:14px ui-monospace,monospace;background:#0b0b0c;color:#e8e8ea;margin:0;padding:40px;max-width:900px}
h1{font:600 16px system-ui,sans-serif}.m{color:#888}.bar{height:6px;background:#222;border-radius:3px;margin:16px 0}
.bar div{height:6px;background:#f59e0b;border-radius:3px;width:0;transition:width .5s}pre{white-space:pre-wrap;color:#bbb}</style></head>
<body><h1>Building <b>${escapeHtml(name)}</b> <span class="m">${escapeHtml(sha.slice(0, 12))}</span></h1>
<div id="s" class="m">starting…</div><div class="bar"><div id="b"></div></div><pre id="l"></pre>
<script>(async function poll(){try{const r=await (await fetch("/__qa_progress",{cache:"no-store"})).json();
if(r.state==="ready"){location.reload();return}
document.getElementById("s").textContent=r.state==="failed"?"Build failed":r.phase+" · "+Math.round(r.elapsedMs/1000)+"s elapsed · ~"+Math.max(0,Math.round(r.remainingMs/1000))+"s left";
document.getElementById("b").style.width=Math.min(100,r.percent)+"%";document.getElementById("l").textContent=r.log;
if(r.state==="failed")return}catch{}setTimeout(poll,2000)})();</script></body></html>`,
		{
			status: 503,
			headers: {
				"content-type": "text/html; charset=utf-8",
				"cache-control": "no-store",
				"retry-after": "5",
			},
		},
	);
