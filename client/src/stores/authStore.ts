import { create } from "zustand";
import api from "@/lib/api";

interface User {
  id: string;
  email: string;
  name: string;
  role: "MERCHANT" | "CREATOR";
  createdAt: string;
  updatedAt: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string, role: string) => Promise<void>;
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

  signup: async (name: string, email: string, password: string, role: string) => {
    const res = await api.post("/auth/signup", { name, email, password, role });
    const { token, user } = res.data;
    localStorage.setItem("tijarflow_token", token);
    set({ token, user, isAuthenticated: true, isLoading: false });
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
