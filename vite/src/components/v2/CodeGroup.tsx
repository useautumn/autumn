import { CheckIcon, CopyIcon } from "@phosphor-icons/react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { common, createStarryNight } from "@wooorm/starry-night";
import { toHtml } from "hast-util-to-html";
import * as React from "react";
import { useClickWithoutDrag } from "@/hooks/common/useClickWithoutDrag";
import { cn } from "@/lib/utils";

const getStarryNight = async () => {
	return await createStarryNight(common);
};

interface CodeGroupProps
	extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.Root> {}

const CodeGroup = React.forwardRef<
	React.ElementRef<typeof TabsPrimitive.Root>,
	CodeGroupProps
>(({ ...props }, ref) => <TabsPrimitive.Root ref={ref} {...props} />);
CodeGroup.displayName = "CodeGroup";

interface CodeGroupListProps
	extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> {}

const CodeGroupList = React.forwardRef<
	React.ElementRef<typeof TabsPrimitive.List>,
	CodeGroupListProps
>(({ className, ...props }, ref) => (
	<TabsPrimitive.List
		ref={ref}
		className={cn("flex items-center w-full border-b-0 h-6", className)}
		{...props}
	/>
));
CodeGroupList.displayName = "CodeGroupList";

interface CodeGroupTabProps
	extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger> {}

const CodeGroupTab = React.forwardRef<
	React.ElementRef<typeof TabsPrimitive.Trigger>,
	CodeGroupTabProps
>(({ className, ...props }, ref) => (
	<TabsPrimitive.Trigger
		ref={ref}
		className={cn(
			"flex items-center justify-center flex-1 min-w-0 h-6 px-2 py-1 text-[13px] font-semibold tracking-[-0.039px] leading-normal whitespace-nowrap",
			"bg-white border border-t10 border-r-0",
			"text-t12 transition-none outline-none",
			"hover:text-primary",
			"focus-visible:text-primary",
			"data-[state=active]:bg-neutral-50  data-[state=active]:shadow-[0px_3px_4px_0px_inset_rgba(0,0,0,0.04)]",
			"data-[state=inactive]:shadow-[0px_-3px_4px_0px_inset_rgba(0,0,0,0.04)]",
			"first:rounded-tl-md first:border-l",
			className,
		)}
		{...props}
	/>
));
CodeGroupTab.displayName = "CodeGroupTab";

interface CodeGroupCopyButtonProps
	extends React.ComponentPropsWithoutRef<"button"> {
	onCopy?: () => void;
}

const CodeGroupCopyButton = React.forwardRef<
	HTMLButtonElement,
	CodeGroupCopyButtonProps
>(({ className, onCopy, ...props }, ref) => {
	const [copied, setCopied] = React.useState(false);

	const handleClick = React.useCallback(
		(e: React.MouseEvent<HTMLButtonElement>) => {
			if (onCopy) onCopy();
			setCopied(true);
			setTimeout(() => setCopied(false), 1200);
			if (props.onClick) props.onClick(e);
		},
		[onCopy, props.onClick],
	);

	return (
		<button
			ref={ref}
			type="button"
			onClick={handleClick}
			className={cn(
				"flex items-center justify-center h-6 px-2 py-1",
				"bg-white border border-t10 rounded-tr-md",
				"shadow-[0px_-3px_4px_0px_inset_rgba(0,0,0,0.04)]",
				"hover:text-primary transition-none outline-none",
				"focus-visible:text-primary",
				className,
			)}
			aria-label={copied ? "Copied!" : "Copy code"}
			{...props}
		>
			{copied ? (
				<CheckIcon className="size-[14px] text-primary" />
			) : (
				<CopyIcon className="size-[14px]" />
			)}
		</button>
	);
});
CodeGroupCopyButton.displayName = "CodeGroupCopyButton";

interface CodeGroupContentProps
	extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content> {
	copyText?: string;
}

const CodeGroupContent = React.forwardRef<
	React.ElementRef<typeof TabsPrimitive.Content>,
	CodeGroupContentProps
>(({ className, copyText, children, ...props }, ref) => {
	const [showCopiedFeedback, setShowCopiedFeedback] = React.useState(false);
	const [isExiting, setIsExiting] = React.useState(false);

	const handleCopy = React.useCallback(
		(e: React.MouseEvent<HTMLDivElement>) => {
			// Get current selection
			const selection = window.getSelection();
			const selectedText = selection?.toString() || "";

			// Determine what to copy
			const textToCopy = selectedText || copyText || "";

			if (textToCopy) {
				navigator.clipboard.writeText(textToCopy);

				// Show feedback with fade in
				setIsExiting(false);
				setShowCopiedFeedback(true);

				// Start fade out after delay
				setTimeout(() => {
					setIsExiting(true);
				}, 1000);

				// Hide completely after fade out animation
				setTimeout(() => {
					setShowCopiedFeedback(false);
					setIsExiting(false);
				}, 1200);
			}
		},
		[copyText],
	);

	const { handleMouseDown, handleClick } = useClickWithoutDrag(handleCopy);

	const handleKeyDown = React.useCallback(
		(e: React.KeyboardEvent<HTMLDivElement>) => {
			if (e.key === "Enter" || e.key === " ") {
				e.preventDefault();
				const textToCopy = copyText || "";
				if (textToCopy) {
					navigator.clipboard.writeText(textToCopy);
					setIsExiting(false);
					setShowCopiedFeedback(true);

					setTimeout(() => {
						setIsExiting(true);
					}, 1000);

					setTimeout(() => {
						setShowCopiedFeedback(false);
						setIsExiting(false);
					}, 1200);
				}
			}
		},
		[copyText],
	);

	return (
		<div className="relative">
			<TabsPrimitive.Content
				ref={ref}
				className={cn(
					"bg-white border border-t10 border-t-0 rounded-bl-lg rounded-br-lg",
					"p-4 outline-none",
					"cursor-pointer transition-colors",
					"hover:bg-neutral-50/50",
					className,
				)}
				onMouseDown={handleMouseDown}
				onClick={handleClick}
				onKeyDown={handleKeyDown}
				role="button"
				tabIndex={0}
				aria-label="Click to copy code"
				{...props}
			>
				{children}
			</TabsPrimitive.Content>

			{showCopiedFeedback && (
				<div
					className={cn(
						"absolute inset-0 flex items-center justify-center pointer-events-none z-10 rounded-bl-lg rounded-br-lg overflow-hidden",
						"transition-opacity duration-300",
						"opacity-0",
						!isExiting && "opacity-100",
					)}
				>
					<div className="absolute inset-0 bg-white/80 backdrop-blur-[2px]" />
					<div className="relative flex items-center gap-2 text-neutral-900 text-sm font-medium">
						<CheckIcon className="size-4" />
						<span>Copied!</span>
					</div>
				</div>
			)}
		</div>
	);
});
CodeGroupContent.displayName = "CodeGroupContent";

interface CodeGroupCodeProps extends React.ComponentPropsWithoutRef<"pre"> {
	language?: string;
	children: string;
}

const CodeGroupCode = React.forwardRef<HTMLPreElement, CodeGroupCodeProps>(
	({ className, language = "jsx", children, ...props }, ref) => {
		const [highlightedCode, setHighlightedCode] = React.useState("");

		React.useEffect(() => {
			const highlight = async () => {
				try {
					const starryNight = await getStarryNight();
					const scope = starryNight.flagToScope(language);

					if (scope) {
						const tree = starryNight.highlight(children, scope);
						let html = toHtml(tree);

						// Post-process: mark operators (single/double char pl-k spans) differently from keywords
						// Operators to mark as grey: : = ! + - * / % & | ^ ~ < > ?
						html = html.replace(
							/<span class="pl-k">([!:=<>+\-*/%&|^~?]+|&gt;|&lt;|&amp;|=>|==|===|!==|!=|<=|>=|&&|\|\|)<\/span>/g,
							'<span class="pl-k pl-operator">$1</span>',
						);

						// Post-process: detect function declarations (pl-c1 followed by = async or = ()
						// Mark these as function names (should be red)
						html = html.replace(
							/<span class="pl-c1">([^<]+)<\/span>(\s*)<span class="pl-k pl-operator">=<\/span>(\s*)(<span class="pl-k">async<\/span>|[(])/g,
							'<span class="pl-c1 pl-function-name">$1</span>$2<span class="pl-k pl-operator">=</span>$3$4',
						);

						// Post-process: wrap property names in object literals (text before : that's not in a span)
						// Match word characters followed by a colon span
						html = html.replace(
							/([a-zA-Z_$][a-zA-Z0-9_$]*)(<span class="pl-k pl-operator">:<\/span>)/g,
							'<span class="pl-property">$1</span>$2',
						);

						// Post-process: wrap HTML/JSX tag names to make them blue like pl-k
						// Match tag names after < or </
						html = html.replace(
							/<span class="pl-k">&lt;(<\/)?<\/span>([a-zA-Z][a-zA-Z0-9]*)/g,
							'<span class="pl-k">&lt;$1</span><span class="pl-k">$2</span>',
						);

						// Post-process: handle plain text HTML tags (not already wrapped in spans)
						// Common HTML tags dictionary
						const htmlTags = [
							"html",
							"head",
							"body",
							"div",
							"span",
							"p",
							"a",
							"img",
							"button",
							"input",
							"form",
							"h1",
							"h2",
							"h3",
							"h4",
							"h5",
							"h6",
							"ul",
							"ol",
							"li",
							"nav",
							"header",
							"footer",
							"section",
							"article",
							"main",
							"aside",
							"table",
							"tr",
							"td",
							"th",
							"thead",
							"tbody",
							"br",
							"hr",
							"meta",
							"link",
							"script",
							"style",
							"title",
							"base",
							"noscript",
						];

						const tagPattern = htmlTags.join("|");

						// Match HTML tags in plain text: <tagname> or </tagname> or <tagname/>
						html = html.replace(
							new RegExp(
								`(&lt;)(/?)(${tagPattern})(\\s[^&]*?)?(&gt;|/&gt;)`,
								"g",
							),
							'<span class="pl-k">$1$2$3</span>$4<span class="pl-k">$5</span>',
						);

						// Post-process: handle self-closing tags and closing brackets for any remaining cases
						// Match closing > or /> and make them blue
						html = html.replace(
							/([a-zA-Z0-9"'\s}])(&gt;|\/&gt;)(?!<\/span>)/g,
							'$1<span class="pl-k">$2</span>',
						);

						// Match JSX attributes (word before = in JSX context)
						// Handles both with space and without space before attribute
						html = html.replace(
							/([>\s])([a-zA-Z][a-zA-Z0-9]*)(<span class="pl-k pl-operator">=<\/span>{)/g,
							'$1<span class="pl-property">$2</span>$3',
						);

						// Post-process: detect boolean values (true/false) and make them purple like strings
						html = html.replace(
							/<span class="pl-c1">(true|false)<\/span>/g,
							'<span class="pl-c1 pl-boolean">$1</span>',
						);

						setHighlightedCode(html);
					} else {
						setHighlightedCode(children);
					}
				} catch (error) {
					console.error("Syntax highlighting error:", error);
					setHighlightedCode(children);
				}
			};

			highlight();
		}, [children, language]);

		return (
			<pre
				ref={ref}
				className={cn(
					"code-group-highlight font-mono font-medium text-[13px] leading-[1.6] whitespace-pre-wrap [overflow-wrap:anywhere] max-w-full overflow-x-auto",
					className,
				)}
				{...props}
			>
				<code
					className={cn(
						`language-${language}`,
						"[overflow-wrap:anywhere] block max-w-full",
					)}
					dangerouslySetInnerHTML={{ __html: highlightedCode || children }}
				/>
			</pre>
		);
	},
);
CodeGroupCode.displayName = "CodeGroupCode";

const CodeGroupCodeSolidColour = React.forwardRef<
	HTMLPreElement,
	React.ComponentPropsWithoutRef<"pre">
>(({ className, children, ...props }, ref) => {
	return (
		<pre ref={ref} className={cn("text-t8", className)} {...props}>
			{children}
		</pre>
	);
});
CodeGroupCodeSolidColour.displayName = "CodeGroupCodeSolidColour";

export {
	CodeGroup,
	CodeGroupList,
	CodeGroupTab,
	CodeGroupCopyButton,
	CodeGroupContent,
	CodeGroupCode,
	CodeGroupCodeSolidColour,
};
