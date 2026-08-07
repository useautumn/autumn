const REB2B_KEY = "4N210HX5V56Z";

const REB2B_SNIPPET = `!function(key) {if (window.reb2b) return;window.reb2b = {loaded: true};var s = document.createElement("script");s.async = true;s.src = "https://ddwl4m2hdecbv.cloudfront.net/b/" + key + "/" + key + ".js.gz";document.getElementsByTagName("script")[0].parentNode.insertBefore(s, document.getElementsByTagName("script")[0]);}("${REB2B_KEY}");`;

export default function Reb2b() {
	return (
		<script
			// biome-ignore lint/security/noDangerouslySetInnerHtml: vendor loader snippet, no user input
			dangerouslySetInnerHTML={{ __html: REB2B_SNIPPET }}
		/>
	);
}
