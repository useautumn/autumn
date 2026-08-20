import { leafSandbox } from "../../lib/sandbox.js";

export default leafSandbox({
	description:
		"Lightweight local sandbox. Shell, file, and web tools are disabled; this avoids Docker startup.",
});
