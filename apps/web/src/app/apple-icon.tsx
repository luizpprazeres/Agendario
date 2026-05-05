import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0a0a",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "78%",
            height: "78%",
            background: "linear-gradient(135deg, #1a1a1a 0%, #0a0a0a 100%)",
            borderRadius: 32,
            border: "2px solid rgba(52, 211, 153, 0.4)",
          }}
        >
          <span
            style={{
              fontSize: 88,
              fontWeight: 700,
              letterSpacing: -4,
              color: "#fafafa",
              fontFamily: "system-ui",
              fontStyle: "italic",
            }}
          >
            ag
          </span>
        </div>
      </div>
    ),
    { ...size }
  );
}
