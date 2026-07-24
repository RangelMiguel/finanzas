import { NextResponse } from "next/server";
import { AuthError, ForbiddenError, BadRequestError } from "./auth";
import { ZodError } from "zod";

export function jsonOk<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function jsonError(error: unknown, fallback = "Error del servidor") {
  if (
    error instanceof AuthError ||
    error instanceof ForbiddenError ||
    error instanceof BadRequestError
  ) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: "Datos inválidos", details: error.flatten() },
      { status: 400 }
    );
  }
  console.error(error);
  const message = error instanceof Error ? error.message : fallback;
  return NextResponse.json({ error: message }, { status: 500 });
}
