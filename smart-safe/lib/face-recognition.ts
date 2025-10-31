import * as faceapi from "face-api.js";
import { storage } from "./storage";

let modelsLoaded = false;

export async function loadFaceModels(): Promise<void> {
  if (modelsLoaded) return;

  // Load models - in production, store these in public/models directory
  const MODEL_URL = "/models";

  await Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
    faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
    faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
  ]);

  modelsLoaded = true;
}

export async function detectFace(
  image: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement
) {
  await loadFaceModels();
  const detection = await faceapi
    .detectSingleFace(image, new faceapi.TinyFaceDetectorOptions())
    .withFaceLandmarks()
    .withFaceDescriptor();

  return detection;
}

export async function computeFaceDescriptor(
  image: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement
): Promise<Float32Array | null> {
  const detection = await detectFace(image);
  return detection?.descriptor || null;
}

export async function recognizeFace(
  descriptor: Float32Array
): Promise<{ userId: string; distance: number } | null> {
  const faceData = await storage.getFaceData();
  const users = await storage.getUsers();

  let bestMatch: { userId: string; distance: number } | null = null;
  const threshold = 0.6; // Adjust based on accuracy needs

  for (const face of faceData) {
    const faceDescriptor = new Float32Array(face.descriptor);
    const distance = faceapi.euclideanDistance(descriptor, faceDescriptor);

    if (distance < threshold) {
      if (!bestMatch || distance < bestMatch.distance) {
        bestMatch = { userId: face.userId, distance };
      }
    }
  }

  return bestMatch;
}

export function createLabeledFaceDescriptors(): faceapi.LabeledFaceDescriptors[] {
  // This can be used for face matching with FaceMatcher
  // Implementation depends on your storage structure
  return [];
}
