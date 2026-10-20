import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { getCurrentUser } from "@/server/auth/session";
import { isAllowedOrigin } from "@/server/http/origin";
import { operations } from "@/server/http/operations";
import { AppError } from "@/utils/errors";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ operation: string }> };

// Nothing from an authenticated API may be cached by a browser or proxy.
const NO_STORE = { "Cache-Control": "no-store, private" };
const MAX_BODY_BYTES = 64 * 1024;

const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

async function run(request: NextRequest, { params }: RouteContext, method: "GET" | "POST") {
  const { operation: name } = await params;
  const operation = Object.hasOwn(operations, name) ? operations[name] : undefined;
  if (!operation || operation.method !== method) return reply({ error: "Unknown operation" }, 404);

  try {
    let input: Record<string, unknown>;
    if (method === "POST") {
      if (!isAllowedOrigin(request)) return reply({ error: "Forbidden origin" }, 403);
      if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return reply({ error: "Request too large" }, 413);
      const body: unknown = await request.json().catch(() => null);
      if (typeof body !== "object" || body === null || Array.isArray(body)) {
        return reply({ error: "Expected a JSON object body" }, 400);
      }
      input = body as Record<string, unknown>;
    } else {
      input = Object.fromEntries(request.nextUrl.searchParams);
    }

    const user = await getCurrentUser();
    if (operation.access === "public") return reply({ data: await operation.handler(input, user) });

    if (!user) return reply({ error: "Sign in required" }, 401);
    if (!operation.access.includes(user.role)) return reply({ error: "Not allowed for your role" }, 403);
    if (operation.projectScoped && user.role === "project-admin") {
      if (input.projectId !== undefined && input.projectId !== user.projectId) {
        return reply({ error: "You can only work on your own project" }, 403);
      }
      input = { ...input, projectId: user.projectId };
    }
    return reply({ data: await operation.handler(input, user) });
  } catch (error) {
    if (error instanceof ZodError) return reply({ error: "Invalid input", issues: error.issues }, 400);
    if (error instanceof AppError) return reply({ error: error.message }, error.status);
    console.error(error);
    // A database that cannot be reached is a temporary failure, not a bug in the request.
    const code = (error as { code?: string }).code ?? "";
    if (/^(ECONN|ETIMEDOUT|PROTOCOL_CONNECTION_LOST|ER_ACCESS_DENIED|ER_BAD_DB)/.test(code)) {
      return reply({ error: "Database unavailable" }, 503);
    }
    return reply({ error: "Internal error" }, 500);
  }
}

export const GET = (request: NextRequest, context: RouteContext) => run(request, context, "GET");
export const POST = (request: NextRequest, context: RouteContext) => run(request, context, "POST");
