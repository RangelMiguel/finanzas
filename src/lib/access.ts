import { NextResponse } from "next/server";
import {
  AuthError,
  ForbiddenError,
  BadRequestError,
  RateLimitError,
} from "./auth";
import { ZodError } from "zod";

export function jsonOk<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function jsonError(error: unknown, fallback = "Error del servidor") {
  if (
    error instanceof AuthError ||
    error instanceof ForbiddenError ||
    error instanceof BadRequestError ||
    error instanceof RateLimitError
  ) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof ZodError) {
    const first =
      error.issues[0]?.message ||
      error.flatten().formErrors[0] ||
      "Datos inválidos";
    return NextResponse.json(
      { error: first, details: error.flatten() },
      { status: 400 }
    );
  }
  console.error(error);
  const message = error instanceof Error ? error.message : fallback;
  return NextResponse.json({ error: message }, { status: 500 });
}
