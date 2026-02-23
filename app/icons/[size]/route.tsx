import { ImageResponse } from "next/og";

export const runtime = "edge";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ size: string }> }
) {
  const { size: sizeParam } = await params;
  const size = parseInt(sizeParam, 10) || 192;
  const radius = Math.round(size * 0.15);
  const fontSize = Math.round(size * 0.32);

  return new ImageResponse(
    (
      <div
        style={{
          width: size,
          height: size,
          backgroundColor: "#111827",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: radius,
        }}
      >
        <span
          style={{
            color: "#ffffff",
            fontSize,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            fontFamily: "sans-serif",
          }}
        >
          TS
        </span>
      </div>
    ),
    { width: size, height: size }
  );
}
