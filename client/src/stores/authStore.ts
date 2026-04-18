import { create } from "zustand";
import api from "@/lib/api";

interface User {
  id: string;
  email: string;
  name: string;
  role: "MERCHANT" | "CREATOR" | "ADMIN";
  createdAt: string;
  updatedAt: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  /** Kick off sign-up: parks credentials on the server and sends an OTP. Returns the email to show the OTP step. */
  signupStart: (name: string, email: string, password: string, role: string) => Promise<{ email: string; message: string }>;
  /** Complete sign-up: verifies OTP, creates user, issues JWT, logs in. */
  signupVerify: (email: string, code: string) => Promise<void>;
  /** Resend the OTP. */
  signupResend: (email: string) => Promise<void>;
  logout: () => void;
  fetchUser: () => Promise<void>;
  updateUser: (user: User) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: localStorage.getItem("tijarflow_token"),
  isAuthenticated: false,
  isLoading: !!localStorage.getItem("tijarflow_token"),

  login: async (email: string, password: string) => {
    const res = await api.post("/auth/login", { email, password });
    const { token, user } = res.data;
    localStorage.setItem("tijarflow_token", token);
    set({ token, user, isAuthenticated: true, isLoading: false });
  },

  signupStart: async (name: string, email: string, password: string, role: string) => {
    const res = await api.post("/auth/signup", { name, email, password, role });
    return { email: res.data.email as string, message: res.data.message as string };
  },

  signupVerify: async (email: string, code: string) => {
    const res = await api.post("/auth/signup/verify", { email, code });
    const { token, user } = res.data;
    localStorage.setItem("tijarflow_token", token);
    set({ token, user, isAuthenticated: true, isLoading: false });
  },

  signupResend: async (email: string) => {
    await api.post("/auth/signup/resend", { email });
  },

  logout: () => {
    localStorage.removeItem("tijarflow_token");
    set({ token: null, user: null, isAuthenticated: false, isLoading: false });
  },

  fetchUser: async () => {
    try {
      const res = await api.get("/auth/me");
      set({ user: res.data.user, isAuthenticated: true, isLoading: false });
    } catch {
      localStorage.removeItem("tijarflow_token");
      set({ token: null, user: null, isAuthenticated: false, isLoading: false });
    }
  },

  updateUser: (user: User) => {
    set({ user });
  },
}));
