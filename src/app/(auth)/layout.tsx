export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-stage">
      <div className="relative z-10 w-full max-w-md">{children}</div>
    </div>
  );
}
