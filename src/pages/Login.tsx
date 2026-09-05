import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import { Loader2, Lock, Mail } from "lucide-react";
import logoMark from "../assets/annvriksh-mark.png";
import ErrorBanner from "../components/ui/ErrorBanner";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { signIn, isLoading, error } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await signIn(email, password);
      navigate("/dashboard");
    } catch (err) {
      console.error("Login failed:", err);
    }
  };

  return (
    <div style={{ minHeight: "100vh", width: "100%", display: "flex" }}>
      <div
        style={{
          flex: "1 1 420px",
          maxWidth: "480px",
          background: "var(--color-brand-green)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "3rem",
          textAlign: "center",
          gap: "1.5rem",
        }}
      >
        <img
          src={logoMark}
          alt="ANNVRIKSH"
          style={{ width: "88px", height: "88px", objectFit: "contain" }}
        />
        <div>
          <h1
            style={{
              fontFamily: "'Fraunces', Georgia, serif",
              fontSize: "2.2rem",
              fontWeight: 600,
              letterSpacing: "0.06em",
              color: "var(--color-brand-cream)",
            }}
          >
            ANNVRIKSH
          </h1>
          <div
            style={{
              fontSize: "0.75rem",
              fontWeight: 600,
              letterSpacing: "0.2em",
              color: "var(--color-brand-gold-light)",
              marginTop: "0.35rem",
            }}
          >
            CMS
          </div>
        </div>
        <p
          style={{
            color: "rgba(253, 251, 247, 0.65)",
            fontSize: "0.95rem",
            maxWidth: "280px",
          }}
        >
          Pure by nature. Essential by choice.
        </p>
      </div>

      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--bg-primary)",
          padding: "1.5rem",
        }}
      >
        <div style={{ width: "100%", maxWidth: "380px" }}>
          <h2
            style={{
              fontFamily: "'Fraunces', Georgia, serif",
              fontSize: "1.5rem",
              marginBottom: "0.4rem",
            }}
          >
            Welcome back
          </h2>
          <p style={{ color: "var(--text-secondary)", marginBottom: "2rem" }}>
            Sign in to manage your store.
          </p>

          {error && <ErrorBanner message={error} />}

          <form
            onSubmit={handleSubmit}
            style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}
          >
            <div className="form-group">
              <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Mail size={16} /> Email Address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@annvriksh.com"
              />
            </div>

            <div className="form-group">
              <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Lock size={16} /> Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              disabled={isLoading}
              style={{ marginTop: "0.5rem", height: "46px" }}
            >
              {isLoading ? (
                <Loader2 className="animate-spin" size={20} />
              ) : (
                "Sign In"
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
