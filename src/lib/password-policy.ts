import { z } from "zod";

/** Strong password: length + character classes (family finance accounts). */
export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 128;

const COMMON = new Set(
  [
    "password",
    "password123",
    "12345678",
    "123456789",
    "1234567890",
    "qwerty123",
    "familia123",
    "admin123",
    "welcome1",
    "letmein",
    "changeme",
    "iloveyou",
    "abc12345",
    "password1",
    "passw0rd",
  ].map((s) => s.toLowerCase())
);

export function passwordIssues(password: string, locale: "es" | "en" = "es"): string[] {
  const issues: string[] = [];
  const es = locale === "es";
  if (password.length < PASSWORD_MIN) {
    issues.push(es ? `Mínimo ${PASSWORD_MIN} caracteres` : `At least ${PASSWORD_MIN} characters`);
  }
  if (password.length > PASSWORD_MAX) {
    issues.push(es ? `Máximo ${PASSWORD_MAX} caracteres` : `At most ${PASSWORD_MAX} characters`);
  }
  if (!/[a-z]/.test(password)) {
    issues.push(es ? "Incluye una minúscula" : "Include a lowercase letter");
  }
  if (!/[A-Z]/.test(password)) {
    issues.push(es ? "Incluye una mayúscula" : "Include an uppercase letter");
  }
  if (!/[0-9]/.test(password)) {
    issues.push(es ? "Incluye un número" : "Include a number");
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    issues.push(es ? "Incluye un símbolo (!@#$…)" : "Include a symbol (!@#$…)");
  }
  if (COMMON.has(password.toLowerCase())) {
    issues.push(es ? "Contraseña demasiado común" : "Password is too common");
  }
  // sequential digits / repeated
  if (/(.)\1{4,}/.test(password)) {
    issues.push(es ? "Evita caracteres repetidos" : "Avoid long repeated characters");
  }
  return issues;
}

export function assertStrongPassword(password: string, locale: "es" | "en" = "es") {
  const issues = passwordIssues(password, locale);
  if (issues.length) {
    const msg =
      locale === "es"
        ? `Contraseña débil: ${issues.join("; ")}`
        : `Weak password: ${issues.join("; ")}`;
    throw new Error(msg);
  }
}

export const strongPasswordSchema = z
  .string()
  .min(PASSWORD_MIN)
  .max(PASSWORD_MAX)
  .superRefine((val, ctx) => {
    for (const issue of passwordIssues(val, "es")) {
      ctx.addIssue({ code: "custom", message: issue });
    }
  });
