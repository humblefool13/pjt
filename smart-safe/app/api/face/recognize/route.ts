import { NextRequest, NextResponse } from "next/server";
import { recognizeFaceFromDescriptor } from "@/lib/face-api-server";
import { storage } from "@/lib/storage";

export async function POST(request: NextRequest) {
  try {
    const { descriptor } = await request.json();

    if (!descriptor) {
      return NextResponse.json(
        { error: "descriptor is required" },
        { status: 400 }
      );
    }

    const match = await recognizeFaceFromDescriptor(descriptor);

    if (!match) {
      // Log unauthorized attempt
      await storage.createEvent({
        type: "unauthorized_face",
        metadata: { reason: "No matching face found" },
      });

      return NextResponse.json(
        { error: "Face not recognized" },
        { status: 401 }
      );
    }

    const user = await storage.getUserById(match.userId);

    return NextResponse.json({
      success: true,
      userId: match.userId,
      userName: user?.name,
      distance: match.distance,
    });
  } catch (error) {
    console.error("Face recognition error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
