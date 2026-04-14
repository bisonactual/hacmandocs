import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

export default function AuthCallbackPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const token = params.get("token");
    if (token) {
      localStorage.setItem("session_token", token);
      // Trigger a full reload so AuthProvider picks up the new token
      window.location.href = import.meta.env.BASE_URL;
    } else {
      navigate("/login");
    }
  }, [params, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-hacman-black">
      <p className="text-hacman-muted">Signing you in…</p>
    </div>
  );
}
