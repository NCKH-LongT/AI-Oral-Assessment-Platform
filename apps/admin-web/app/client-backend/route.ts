import { backendConfig, switchBackend } from "../../lib/client-backend.mjs";

export const runtime = "nodejs";
export async function GET() {
  const config = backendConfig();
  return Response.json(
    { enabled: !!config, ...config },
    { headers: { "Cache-Control": "no-store" } },
  );
}
export async function POST(request: Request) {
  return switchBackend(request);
}
