export default function LoadingSpinner({ color }: { color?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      <div
        style={{
          width: "16px",
          height: "16px",
          borderRadius: "50%",
          border: `2px solid ${color || "#fff"}`,
          borderTop: `2px solid transparent`,
          animation: "spin 0.7s linear infinite",
          zIndex: 2,
        }}
      />
      &#8203;
    </div>
  );
}
