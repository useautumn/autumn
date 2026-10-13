import { escapeHtml } from "./escapeHtml";

export const wakingPage = ({ name, sha }: { name: string; sha: string }) =>
	new Response(
		`<!doctype html><html><head><meta charset="utf-8"><title>Waking ${escapeHtml(name)}…</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font:15px system-ui,sans-serif;background:#0b0b0c;color:#e8e8ea;display:grid;place-items:center;height:100vh;margin:0}
.c{text-align:center}.s{width:28px;height:28px;border:3px solid #333;border-top-color:#f59e0b;border-radius:50%;animation:r .8s linear infinite;margin:0 auto 16px}
@keyframes r{to{transform:rotate(360deg)}}small{color:#888}</style></head>
<body><div class="c"><div class="s"></div><div>Waking <b>${escapeHtml(name)}</b>…</div>
<small>${escapeHtml(sha.slice(0, 12))} · <span id="t">0</span>s</small></div>
<script>const s=Date.now();setInterval(()=>{document.getElementById("t").textContent=Math.round((Date.now()-s)/1000)},500);
(async function poll(){try{const r=await fetch("/__qa_wake_status",{cache:"no-store"});if(r.ok&&(await r.json()).ready){location.reload();return}}catch{}setTimeout(poll,1000)})();</script>
</body></html>`,
		{
			status: 503,
			headers: {
				"content-type": "text/html; charset=utf-8",
				"cache-control": "no-store",
				"retry-after": "3",
			},
		},
	);
