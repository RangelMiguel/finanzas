export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-stage">
      <div
        className="ambient-orb"
        style={{
          width: 320,
          height: 320,
          top: "8%",
          left: "12%",
          background: "rgba(232,184,109,0.25)",
        }}
        aria-hidden
      />
      <div
        className="ambient-orb"
        style={{
          width: 280,
          height: 280,
          bottom: "10%",
          right: "10%",
          background: "rgba(124,156,255,0.22)",
        }}
        aria-hidden
      />
      <div className="relative z-10 w-full max-w-md">{children}</div>
    </div>
  );
}
