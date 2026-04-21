import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api",
  timeout: 15000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("tijarflow_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Only force-logout when the auth middleware itself rejected the token
    // (missing / invalid / expired — all tagged with code UNAUTHORIZED). A
    // plain 401 from a route handler means a semantic failure (e.g. "wrong
    // current password"), and those must NOT log the user out.
    const status = error.response?.status;
    const code = error.response?.data?.code;
    if (status === 401 && code === "UNAUTHORIZED") {
      localStorage.removeItem("tijarflow_token");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

export default api;
