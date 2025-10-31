import { NextRequest, NextResponse } from "next/server";
import { storage } from "@/lib/storage";
import { saveFaceData } from "@/lib/face-api-server";
import { hashPassword } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const { userId, descriptor, pin, voicePhrase } = await request.json();

    if (!userId) {
      return NextResponse.json(
        { error: "UserId is required" },
        { status: 400 }
      );
    }

    // Save face descriptor if provided (computed client-side)
    if (descriptor) {
      const savedDescriptor = await saveFaceData(userId, descriptor);

      if (!savedDescriptor) {
        return NextResponse.json(
          { error: "Invalid descriptor" },
          { status: 400 }
        );
      }
    }

    // Ensure user exists before updating (for PIN and voice phrase)
    let user = await storage.getUserById(userId);
    if (!user && (pin || voicePhrase)) {
      // Create a basic user record if it doesn't exist
      // This happens when face is registered first without a user account
      // We need to create it with the same userId from face registration
      const users = await storage.getUsers();
      const newUser = {
        id: userId, // Use the userId from face registration
        name: `User ${userId}`,
        email: `${userId}@safe.local`,
        passwordHash: await hashPassword(""), // Empty password, not used for safe access
        isAdmin: false,
        createdAt: new Date().toISOString(),
      };
      users.push(newUser);
      // Write directly to ensure userId matches
      const fs = await import("fs");
      const path = await import("path");
      const DATA_DIR = path.join(process.cwd(), "data");
      const USERS_FILE = path.join(DATA_DIR, "users.json");
      await fs.promises.writeFile(
        USERS_FILE,
        JSON.stringify(users, null, 2),
        "utf-8"
      );
      user = newUser;
    }

    // Save PIN hash if provided
    if (pin) {
      const pinHash = await hashPassword(pin);
      // Refresh user to get latest state
      user = await storage.getUserById(userId);
      if (!user) {
        // Create user with PIN if user doesn't exist
        const users = await storage.getUsers();
        const newUser = {
          id: userId,
          name: `User ${userId}`,
          email: `${userId}@safe.local`,
          passwordHash: await hashPassword(""),
          isAdmin: false,
          pinHash,
          createdAt: new Date().toISOString(),
        };
        users.push(newUser);
        const fs = await import("fs");
        const path = await import("path");
        const DATA_DIR = path.join(process.cwd(), "data");
        const USERS_FILE = path.join(DATA_DIR, "users.json");
        await fs.promises.writeFile(
          USERS_FILE,
          JSON.stringify(users, null, 2),
          "utf-8"
        );
      } else {
        const updatedUser = await storage.updateUser(userId, { pinHash });
        if (!updatedUser) {
          console.error(`Failed to update PIN for userId: ${userId}`);
        }
      }
    }

    // Save voice phrase if provided
    if (voicePhrase) {
      // Refresh user to get latest state
      user = await storage.getUserById(userId);
      if (!user) {
        // Create user with voice phrase if user doesn't exist
        const users = await storage.getUsers();
        const newUser = {
          id: userId,
          name: `User ${userId}`,
          email: `${userId}@safe.local`,
          passwordHash: await hashPassword(""),
          isAdmin: false,
          voicePhrase,
          createdAt: new Date().toISOString(),
        };
        users.push(newUser);
        const fs = await import("fs");
        const path = await import("path");
        const DATA_DIR = path.join(process.cwd(), "data");
        const USERS_FILE = path.join(DATA_DIR, "users.json");
        await fs.promises.writeFile(
          USERS_FILE,
          JSON.stringify(users, null, 2),
          "utf-8"
        );
      } else {
        const updatedUser = await storage.updateUser(userId, { voicePhrase });
        if (!updatedUser) {
          console.error(`Failed to update voice phrase for userId: ${userId}`);
        }
      }
    }

    // Log setup event only if this is completing setup (has pin or voicePhrase)
    if (pin || voicePhrase) {
      const user = await storage.getUserById(userId);
      await storage.createEvent({
        type: "setup",
        userId,
        userName: user?.name,
        metadata: { hasPin: !!pin, hasVoicePhrase: !!voicePhrase },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Face registration error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
