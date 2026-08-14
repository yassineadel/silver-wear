import { api } from "./api";

export type User = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
};

export const login = (email: string, password: string) =>
  api<{ user: User }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });

export const register = (input: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
}) =>
  api<{ message: string; expiresInMinutes: number }>("/auth/register", {
    method: "POST",
    body: JSON.stringify(input),
  });

export const verifyOtp = (email: string, code: string) =>
  api<{ user: User }>("/auth/verify-otp", {
    method: "POST",
    body: JSON.stringify({ email, code }),
  });

export const getMe = () => api<{ user: User | null }>("/auth/me");

export const logout = () => api<void>("/auth/logout", { method: "POST" });