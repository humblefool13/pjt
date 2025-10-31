import { NextRequest, NextResponse } from "next/server";
import { storage } from "@/lib/storage";
import { verifyPassword } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const { userId, pin } = await request.json();

    if (!userId || !pin) {
      return NextResponse.json(
        { error: "UserId and PIN are required" },
        { status: 400 }
      );
    }

    const user = await storage.getUserById(userId);
    if (!user) {
      console.error(
        `PIN verification failed: User not found for userId: ${userId}`
      );
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (!user.pinHash) {
      console.error(
        `PIN verification failed: No PIN hash for userId: ${userId}, user: ${JSON.stringify(
          { id: user.id, name: user.name, email: user.email }
        )}`
      );
      return NextResponse.json(
        { error: "PIN not set for this user" },
        { status: 400 }
      );
    }

    const isValid = await verifyPassword(pin, user.pinHash);
    if (!isValid) {
      console.error(
        `PIN verification failed: Invalid PIN for userId: ${userId}, provided PIN length: ${pin.length}`
      );
      // Log failed PIN attempt
      await storage.createEvent({
        type: "unauthorized_face",
        userId,
        userName: user.name,
        metadata: { reason: "Invalid PIN" },
      });

      return NextResponse.json({ error: "Invalid PIN" }, { status: 401 });
    }

    console.log(`PIN verification successful for userId: ${userId}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("PIN verification error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
