// Server-side face recognition utilities
// Note: face-api.js doesn't work well server-side in Next.js without canvas polyfills
// This is a simplified version - in production, consider using client-side recognition
// or a dedicated face recognition service

import { storage } from "./storage";

// For now, we'll accept pre-computed descriptors from the client
// The client should compute the descriptor using face-api.js and send it to the server

// Accept pre-computed face descriptor from client
export async function saveFaceData(
  userId: string,
  descriptor: number[] | Float32Array
): Promise<Float32Array | null> {
  const descriptorArray =
    descriptor instanceof Float32Array
      ? descriptor
      : new Float32Array(descriptor);

  if (descriptorArray.length === 0) {
    return null;
  }

  await storage.saveFaceData(userId, descriptorArray);
  return descriptorArray;
}

// Match face descriptor against stored faces
export async function recognizeFaceFromDescriptor(
  descriptor: number[] | Float32Array
): Promise<{ userId: string; distance: number } | null> {
  const faceData = await storage.getFaceData();
  let bestMatch: { userId: string; distance: number } | null = null;
  const threshold = 0.6;

  const inputDescriptor =
    descriptor instanceof Float32Array
      ? descriptor
      : new Float32Array(descriptor);

  for (const face of faceData) {
    const faceDescriptor = new Float32Array(face.descriptor);

    // Calculate euclidean distance
    let sum = 0;
    for (
      let i = 0;
      i < inputDescriptor.length && i < faceDescriptor.length;
      i++
    ) {
      const diff = inputDescriptor[i] - faceDescriptor[i];
      sum += diff * diff;
    }
    const distance = Math.sqrt(sum);

    if (distance < threshold) {
      if (!bestMatch || distance < bestMatch.distance) {
        bestMatch = { userId: face.userId, distance };
      }
    }
  }

  return bestMatch;
}
