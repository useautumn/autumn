import { common, createStarryNight } from "@wooorm/starry-night";
import { toHtml } from "hast-util-to-html";
import { Root } from "hast-util-to-html/lib/types";
import React from "react";
import "@wooorm/starry-night/style/dark";
import CopyButton from "@/components/general/CopyButton";

interface CodeDisplayProps {
  code: string;
  language: string;
}

const getStarryNight = async () => {
  return await createStarryNight(common);
};

export const CodeDisplay: React.FC<CodeDisplayProps> = ({ code, language }) => {
  const [highlightedCode, setHighlightedCode] = React.useState("");

  // Format language name to look nicer
  const formatLanguage = (lang: string) => {
    return lang.charAt(0).toUpperCase() + lang.slice(1).toLowerCase();
  };

  React.useEffect(() => {
    const highlight = async () => {
      const starryNight = await getStarryNight();
      const scope = starryNight.flagToScope(language);

      if (scope) {
        const tree = starryNight.highlight(code, scope);
        const html = toHtml(tree as Root);
        // Wrap the HTML in a div with inline styles
        const styledHtml = `<div style="white-space: pre; display: inline-block; width: 10px;">${html}</div>`;
        setHighlightedCode(styledHtml);
      } else {
        setHighlightedCode(
          `<div style="white-space: pre; display: inline-block; width: 10px;">${code}</div>`
        );
      }
    };

    highlight();
  }, [code, language]);

  return (
    <div className="text-sm overflow-x-auto bg-slate-900 rounded-sm px-2 pt-2 [&::-webkit-scrollbar]:bg-transparent [&::-webkit-scrollbar-track]:bg-transparent">
      <div className="flex justify-between items-center w-full">
        <div className="text-xs text-zinc-400 font-mono">
          {formatLanguage(language)}
        </div>
        <CopyButton
          text={code}
          className="text-white hover:text-white/80 hover:bg-zinc-800"
        />
      </div>
      <pre className="overflow-x-auto px-4 py-1 [&::-webkit-scrollbar]:bg-transparent [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-zinc-600 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar]:h-2">
        <div className="max-w-full">
          <code
            className={`language-${language} text-white`}
            dangerouslySetInnerHTML={{ __html: highlightedCode }}
          />
        </div>
      </pre>
    </div>
  );
};
