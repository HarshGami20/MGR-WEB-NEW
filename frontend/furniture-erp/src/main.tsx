import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { setAuthTokenGetter, setBaseUrl } from "@/api-client";

setAuthTokenGetter(() => localStorage.getItem("erp_token"));

// When set, fetch(`/api/...`) becomes `${VITE_API_URL}/api/...` (e.g. backend on another host/port).
// Leave unset in dev to use Vite's `/api` proxy (see vite.config.ts).
const apiUrl = import.meta.env.VITE_API_URL?.trim();
if (apiUrl) {
  setBaseUrl(apiUrl.replace(/\/+$/, ""));
}

createRoot(document.getElementById("root")!).render(<App />);
