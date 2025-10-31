import { NextRequest, NextResponse } from "next/server";
import { storage } from "@/lib/storage";
import { verifyToken } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("auth-token")?.value;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = verifyToken(token);
    if (!payload || !payload.isAdmin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const limit = request.nextUrl.searchParams.get("limit");
    const events = await storage.getEvents(limit ? parseInt(limit) : undefined);

    return NextResponse.json({ events });
  } catch (error) {
    console.error("Get events error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { type, userId, userName, metadata } = await request.json();

    if (!type) {
      return NextResponse.json(
        { error: "Event type is required" },
        { status: 400 }
      );
    }

    const event = await storage.createEvent({
      type,
      userId,
      userName,
      metadata,
    });

    return NextResponse.json({ success: true, event });
  } catch (error) {
    console.error("Create event error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
