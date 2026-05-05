import { ImageResponse } from "next/og";

export const size = { width: 192, height: 192 };
export const contentType = "image/png";

export default function Icon() {
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
          borderRadius: 0,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "75%",
            height: "75%",
            background: "linear-gradient(135deg, #1a1a1a 0%, #0a0a0a 100%)",
            borderRadius: 36,
            border: "2px solid rgba(52, 211, 153, 0.4)",
            boxShadow: "0 0 60px rgba(52, 211, 153, 0.15)",
          }}
        >
          <span
            style={{
              fontSize: 96,
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
