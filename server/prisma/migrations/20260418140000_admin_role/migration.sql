-- Add ADMIN to UserRole enum. Admins are promoted manually (no self-signup).
ALTER TYPE "UserRole" ADD VALUE 'ADMIN';
