// Critical loading styles applied inline
export const loadingStyles: React.CSSProperties = {
	width: "100%",
	height: "100%",
	display: "flex",
	justifyContent: "center",
	alignItems: "center",
	minHeight: "300px",
};

export const spinnerStyles: React.CSSProperties = {
	width: "1.5rem",
	height: "1.5rem",
	color: "rgb(161 161 170)",
	animation: "spin 1s linear infinite",
};

// Inject keyframes immediately
if (typeof document !== "undefined") {
	const styleId = "au-spinner-keyframes";
	if (!document.getElementById(styleId)) {
		const style = document.createElement("style");
		style.id = styleId;
		style.textContent = `
      @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
    `;
		document.head.appendChild(style);
	}
}
