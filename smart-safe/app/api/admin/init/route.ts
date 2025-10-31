// Initialize admin user - run this once to create the first admin
import { NextResponse } from "next/server";
import { storage } from "@/lib/storage";
import { hashPassword } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const { name, email, password } = await request.json();

    if (!name || !email || !password) {
      return NextResponse.json(
        { error: "Name, email, and password are required" },
        { status: 400 }
      );
    }

    // Check if admin already exists
    const existingAdmin = await storage.getUserByEmail(email);
    if (existingAdmin) {
      return NextResponse.json(
        { error: "Admin user already exists" },
        { status: 400 }
      );
    }

    const passwordHash = await hashPassword(password);
    const admin = await storage.createUser({
      name,
      email,
      passwordHash,
      isAdmin: true,
    });

    const { passwordHash: _, ...safeAdmin } = admin;

    return NextResponse.json({
      success: true,
      message: "Admin user created successfully",
      admin: safeAdmin,
    });
  } catch (error) {
    console.error("Init admin error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
