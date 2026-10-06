import { type FormEvent, useEffect, useRef, useState } from "react";
import { Flash } from "./flash/Flash";
import { supabase } from "./lib/supabase";
import { Typing } from "./typing/Typing";

type Tool = "typing" | "flash";

export function App() {
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) {
      setReady(true);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setEmail(data.session?.user.email ?? null);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user.email ?? null);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  if (!ready) {
    return (
      <main className="app">
        <p className="loading muted"><Logo /> Loading…</p>
      </main>
    );
  }
  if (!supabase) return <Shell local />;
  if (!email) return <AuthScreen />;
  return <Shell email={email} />;
}

function AuthScreen() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError("");
    setMessage("");
    const credentials = { email: email.trim(), password };
    const result = mode === "in" ? await supabase.auth.signInWithPassword(credentials) : await supabase.auth.signUp(credentials);
    setBusy(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    if (mode === "up" && !result.data.session) setMessage("Check your email to confirm the account, then sign in.");
  }

  return (
    <main className="app">
      <div className="brand auth-brand">
        <Logo />
        <div>
          <h1>MemoType</h1>
          <p className="muted">Typing practice and flashcards for your phone.</p>
        </div>
      </div>
      <form className="card auth" onSubmit={submit}>
        <label>
          Email
          <input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </label>
        <label>
          Password
          <input type="password" autoComplete={mode === "in" ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} required minLength={6} />
        </label>
        {error && <p className="bad">{error}</p>}
        {message && <p className="good">{message}</p>}
        <button className="primary" disabled={busy}>{mode === "in" ? "Sign in" : "Create account"}</button>
        <button type="button" onClick={() => setMode(mode === "in" ? "up" : "in")}>
          {mode === "in" ? "Need an account?" : "Already have an account?"}
        </button>
      </form>
    </main>
  );
}

function Logo() {
  return <img className="logo" src="/favicon.svg" alt="" />;
}

function Shell({ email, local = false }: { email?: string; local?: boolean }) {
  const [tool, setTool] = useState<Tool>("typing");
  const [menuOpen, setMenuOpen] = useState(false);
  const barRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    function onPointer(event: PointerEvent) {
      if (!barRef.current?.contains(event.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [menuOpen]);

  function choose(next: Tool) {
    setTool(next);
    setMenuOpen(false);
  }

  return (
    <main className="app">
      <header className="top" ref={barRef}>
        <div className="brand">
          <Logo />
          <div>
            <h1>MemoType</h1>
            <p className="current">{tool === "typing" ? "Typing" : "Flashcards"}</p>
          </div>
        </div>
        <button
          className="icon-button"
          aria-expanded={menuOpen}
          aria-controls="app-menu"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span className="bars" />
        </button>
        {menuOpen && (
          <nav id="app-menu" className="menu">
            <button aria-pressed={tool === "typing"} onClick={() => choose("typing")}>Typing</button>
            <button aria-pressed={tool === "flash"} onClick={() => choose("flash")}>Flashcards</button>
            <div className="menu-account">
              {local ? <span className="muted">Saved in this browser</span> : <button onClick={() => supabase?.auth.signOut()}>Sign out · {email}</button>}
            </div>
          </nav>
        )}
      </header>
      {tool === "typing" ? <Typing /> : <Flash />}
    </main>
  );
}
