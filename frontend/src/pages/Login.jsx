import { useState } from "react";

export default function Login({ onSubmit, error, loading }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("admin@mentalmetrics.local");
  const [password, setPassword] = useState("changeme");

  const title = mode === "login" ? "Sign in" : "Create account";

  return (
    <div className="login-page">
      <form
        className="login-card"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit({ email, password, mode });
        }}
      >
        <div>
          <p className="section-label">MentalMetrics</p>
          <h1 className="login-title">{title}</h1>
        </div>

        <label className="field-group">
          <span className="field-label">Email</span>
          <input
            className="text-input"
            type="email"
            value={email}
            autoComplete="email"
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>

        <label className="field-group">
          <span className="field-label">Password</span>
          <input
            className="text-input"
            type="password"
            value={password}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            minLength={8}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>

        {error && <div className="inline-error">{error}</div>}

        <button type="submit" className="primary-button" disabled={loading}>
          {loading ? "Please wait..." : title}
        </button>

        <button
          type="button"
          className="link-button login-mode-button"
          onClick={() => setMode((current) => (current === "login" ? "register" : "login"))}
        >
          {mode === "login" ? "Create a new account" : "Use an existing account"}
        </button>
      </form>
    </div>
  );
}
