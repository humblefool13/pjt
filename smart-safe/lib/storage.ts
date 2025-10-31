// Simple file-based storage for development
// In production, replace with a proper database
import { promises as fs } from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const EVENTS_FILE = path.join(DATA_DIR, "events.json");
const FACES_FILE = path.join(DATA_DIR, "faces.json");

interface User {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  isAdmin: boolean;
  faceDescriptor?: Float32Array;
  voicePhrase?: string;
  pinHash?: string; // Hashed PIN for safe access
  createdAt: string;
}

interface Event {
  id: string;
  type:
    | "lock"
    | "unlock"
    | "setup"
    | "unauthorized_face"
    | "theft_detected"
    | "ghost_mode";
  userId?: string;
  userName?: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

interface FaceData {
  userId: string;
  descriptor: number[];
  image?: string;
  createdAt: string;
}

async function ensureDataDir() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch (error) {
    // Directory might already exist
  }
}

async function readFile<T>(filePath: string, defaultValue: T): Promise<T> {
  try {
    await ensureDataDir();
    const data = await fs.readFile(filePath, "utf-8");
    return JSON.parse(data);
  } catch (error) {
    return defaultValue;
  }
}

async function writeFile<T>(filePath: string, data: T): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
}

export const storage = {
  // Users
  async getUsers(): Promise<User[]> {
    return readFile(USERS_FILE, []);
  },

  async getUserById(id: string): Promise<User | null> {
    const users = await this.getUsers();
    return users.find((u) => u.id === id) || null;
  },

  async getUserByEmail(email: string): Promise<User | null> {
    const users = await this.getUsers();
    return users.find((u) => u.email === email) || null;
  },

  async createUser(user: Omit<User, "id" | "createdAt">): Promise<User> {
    const users = await this.getUsers();
    const newUser: User = {
      ...user,
      id: Date.now().toString(),
      createdAt: new Date().toISOString(),
    };
    users.push(newUser);
    await writeFile(USERS_FILE, users);
    return newUser;
  },

  async updateUser(id: string, updates: Partial<User>): Promise<User | null> {
    const users = await this.getUsers();
    const index = users.findIndex((u) => u.id === id);
    if (index === -1) return null;
    users[index] = { ...users[index], ...updates };
    await writeFile(USERS_FILE, users);
    return users[index];
  },

  async deleteUser(id: string): Promise<boolean> {
    const users = await this.getUsers();
    const filtered = users.filter((u) => u.id !== id);
    if (filtered.length === users.length) return false;
    await writeFile(USERS_FILE, filtered);
    return true;
  },

  // Events
  async getEvents(limit?: number): Promise<Event[]> {
    const events = await readFile<Event[]>(EVENTS_FILE, []);
    const sorted = events.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    return limit ? sorted.slice(0, limit) : sorted;
  },

  async createEvent(event: Omit<Event, "id" | "timestamp">): Promise<Event> {
    const events = await this.getEvents();
    const newEvent: Event = {
      ...event,
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
    };
    events.push(newEvent);
    await writeFile(EVENTS_FILE, events);
    return newEvent;
  },

  // Face Data
  async getFaceData(): Promise<FaceData[]> {
    return readFile(FACES_FILE, []);
  },

  async saveFaceData(
    userId: string,
    descriptor: Float32Array,
    image?: string
  ): Promise<void> {
    const faces = await this.getFaceData();
    const existingIndex = faces.findIndex((f) => f.userId === userId);
    const faceData: FaceData = {
      userId,
      descriptor: Array.from(descriptor),
      image,
      createdAt: new Date().toISOString(),
    };

    if (existingIndex >= 0) {
      faces[existingIndex] = faceData;
    } else {
      faces.push(faceData);
    }

    await writeFile(FACES_FILE, faces);

    // Update user's face descriptor reference
    await this.updateUser(userId, { faceDescriptor: descriptor });
  },

  async deleteFaceData(userId: string): Promise<boolean> {
    const faces = await this.getFaceData();
    const filtered = faces.filter((f) => f.userId !== userId);
    if (filtered.length === faces.length) return false;
    await writeFile(FACES_FILE, filtered);
    return true;
  },
};
