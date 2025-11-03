"use client";

import { useState, useRef, useEffect } from "react";
import * as faceapi from "face-api.js";
import { io, Socket } from "socket.io-client";

type SafeState = "locked" | "unlocking" | "unlocked" | "setup";
type SetupMode = "face" | "pin" | "phrase" | "complete";

export default function SafePage() {
  const [safeState, setSafeState] = useState<SafeState>("locked");
  const [setupMode, setSetupMode] = useState<SetupMode>("face");
  const [cameraPermission, setCameraPermission] = useState<boolean | null>(
    null
  );
  const [micPermission, setMicPermission] = useState<boolean | null>(null);
  const [pin, setPin] = useState<string>(""); // PIN input during unlock
  const [setupPin, setSetupPin] = useState<string>(""); // PIN during setup
  const [confirmPin, setConfirmPin] = useState<string>(""); // PIN confirmation during setup
  const [phrase, setPhrase] = useState<string>("");
  const [isRecording, setIsRecording] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [setupUserId, setSetupUserId] = useState<string | null>(null); // Store userId during setup
  const [slideshowIndex, setSlideshowIndex] = useState<number>(0); // Current image index for slideshow

  // Images for slideshow
  const slideshowImages = [
    "/cash.jpeg",
    "/gold.jpg",
    "/keys.jpeg",
    "/silver.jpg",
    "/watches.jpeg",
  ];

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const socketRef = useRef<Socket | null>(null);
  const slideshowIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const slideshowInitializedRef = useRef<boolean>(false);

  // Load face-api.js models
  useEffect(() => {
    const loadModels = async () => {
      try {
        const MODEL_URL = "/models";
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        ]);
        setModelsLoaded(true);
        setStatusMessage("Models loaded. Ready to scan.");
      } catch (error) {
        console.error("Error loading face models:", error);
        setStatusMessage(
          "Error loading face recognition models. Please check /public/models directory."
        );
      }
    };
    loadModels();
  }, []);

  // Request permissions (only check status, don't request automatically)
  useEffect(() => {
    const checkPermissions = async () => {
      try {
        // Check camera permission status
        if (navigator.permissions) {
          const cameraStatus = await navigator.permissions.query({
            name: "camera" as PermissionName,
          });
          setCameraPermission(cameraStatus.state === "granted");

          const micStatus = await navigator.permissions.query({
            name: "microphone" as PermissionName,
          });
          setMicPermission(micStatus.state === "granted");
        }
      } catch {
        // If permissions API not available, check by trying to access
        console.log(
          "Permissions API not available, will request on button click"
        );
      }
    };
    checkPermissions();
  }, []);

  // Slideshow effect when safe is unlocked
  useEffect(() => {
    if (safeState === "unlocked") {
      // Reset to first image when starting slideshow
      // Use setTimeout to defer state update and avoid linter warning
      const timeoutId = setTimeout(() => {
        setSlideshowIndex(0);
        slideshowInitializedRef.current = true;
      }, 0);

      // Start slideshow
      slideshowIntervalRef.current = setInterval(() => {
        setSlideshowIndex((prev) => (prev + 1) % slideshowImages.length);
      }, 1500); // Change image every 1.5 seconds

      return () => {
        clearTimeout(timeoutId);
      };
    } else {
      // Stop slideshow
      slideshowInitializedRef.current = false;
      if (slideshowIntervalRef.current) {
        clearInterval(slideshowIntervalRef.current);
        slideshowIntervalRef.current = null;
      }
    }

    // Cleanup on unmount or state change
    return () => {
      if (slideshowIntervalRef.current) {
        clearInterval(slideshowIntervalRef.current);
        slideshowIntervalRef.current = null;
      }
    };
  }, [safeState, slideshowImages.length]);

  // Request permissions function (called by button click)
  const requestPermissions = async () => {
    try {
      // Check if mediaDevices API is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        // Try legacy API as fallback
        type LegacyGetUserMedia = (
          constraints: MediaStreamConstraints,
          successCallback: (stream: MediaStream) => void,
          errorCallback: (error: Error) => void
        ) => void;

        const nav = navigator as Navigator & {
          getUserMedia?: LegacyGetUserMedia;
          webkitGetUserMedia?: LegacyGetUserMedia;
          mozGetUserMedia?: LegacyGetUserMedia;
          msGetUserMedia?: LegacyGetUserMedia;
        };

        const getUserMedia =
          nav.getUserMedia ||
          nav.webkitGetUserMedia ||
          nav.mozGetUserMedia ||
          nav.msGetUserMedia;

        if (!getUserMedia) {
          setStatusMessage(
            "Your browser doesn't support camera/microphone access. Please use a modern browser or ensure you're on HTTPS."
          );
          setCameraPermission(false);
          setMicPermission(false);
          return;
        }

        // Use legacy API (old callback-based format)
        getUserMedia(
          { video: true, audio: true },
          (stream: MediaStream) => {
            setCameraPermission(true);
            setMicPermission(true);
            setStatusMessage("Permissions granted! You can now use the safe.");
            stream.getTracks().forEach((track) => track.stop());
          },
          (error: Error & { name?: string }) => {
            console.error("Permission error:", error);
            setCameraPermission(false);
            setMicPermission(false);
            setStatusMessage(
              "Permissions denied. Please allow camera and microphone access."
            );
          }
        );
        return;
      }

      setStatusMessage("Requesting camera and microphone permissions...");

      // Request both camera and microphone together
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
        audio: true,
      });

      setCameraPermission(true);
      setMicPermission(true);
      setStatusMessage("Permissions granted! You can now use the safe.");

      // Stop the stream immediately (we'll start it again when needed)
      stream.getTracks().forEach((track) => track.stop());
    } catch (error) {
      console.error("Permission error:", error);
      setCameraPermission(false);
      setMicPermission(false);

      const err = error as Error & { name?: string };
      if (
        err.name === "NotAllowedError" ||
        err.name === "PermissionDeniedError"
      ) {
        setStatusMessage(
          "Permissions denied. Please allow camera and microphone access in your browser settings."
        );
      } else if (err.name === "NotFoundError") {
        setStatusMessage(
          "Camera or microphone not found. Please check your device."
        );
      } else if (err.message?.includes("getUserMedia")) {
        setStatusMessage(
          "Camera/microphone access not available. Please ensure you're using HTTPS or a secure connection."
        );
      } else {
        setStatusMessage(
          "Error requesting permissions: " + (err.message || "Unknown error")
        );
      }
    }
  };

  // Initialize WebSocket for sensor data
  useEffect(() => {
    if (typeof window !== "undefined") {
      const socket = io(
        process.env.NEXT_PUBLIC_WS_URL || "http://localhost:3000",
        {
          path: "/api/socket",
        }
      );

      socketRef.current = socket;

      socket.on("connect", () => {
        console.log("Connected to sensor server");
      });

      socket.on("disconnect", () => {
        console.log("Disconnected from sensor server");
      });

      return () => {
        socket.disconnect();
      };
    }
  }, []);

  // Start sensor data collection
  // useEffect(() => {
  //   if (
  //     safeState !== "locked" &&
  //     typeof window !== "undefined" &&
  //     "DeviceMotionEvent" in window
  //   ) {
  //     const handleMotion = (event: DeviceMotionEvent) => {
  //       if (event.acceleration && event.rotationRate && socketRef.current) {
  //         const sensorData = {
  //           accelerometer: {
  //             x: event.acceleration.x || 0,
  //             y: event.acceleration.y || 0,
  //             z: event.acceleration.z || 0,
  //           },
  //           gyroscope: {
  //             x: event.rotationRate.alpha || 0,
  //             y: event.rotationRate.beta || 0,
  //             z: event.rotationRate.gamma || 0,
  //           },
  //           timestamp: Date.now(),
  //         };
  //         socketRef.current.emit("sensor-data", sensorData);
  //       }
  //     };

  //     window.addEventListener("devicemotion", handleMotion);
  //     return () => window.removeEventListener("devicemotion", handleMotion);
  //   }
  // }, [safeState]);

  // Start video stream
  const startVideo = async () => {
    if (videoRef.current) {
      try {
        // Check if mediaDevices API is available
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          setStatusMessage(
            "Camera access not available. Please check your browser support."
          );
          return;
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480 },
        });
        videoRef.current.srcObject = stream;
      } catch (error) {
        console.error("Error accessing camera:", error);
        const err = error as Error & { name?: string };
        if (
          err.name === "NotAllowedError" ||
          err.name === "PermissionDeniedError"
        ) {
          setStatusMessage(
            "Camera permission denied. Please grant camera access."
          );
        } else {
          setStatusMessage(
            "Error accessing camera: " + (err.message || "Unknown error")
          );
        }
      }
    }
  };

  // Stop video stream
  const stopVideo = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
  };

  // Capture frame and process
  const captureAndProcess = async () => {
    if (!videoRef.current || !canvasRef.current || !modelsLoaded) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(video, 0, 0);
      const imageData = canvas.toDataURL("image/png").split(",")[1];

      return imageData;
    }
    return null;
  };

  // Handle unlock
  const handleUnlock = async () => {
    if (!modelsLoaded) {
      setStatusMessage("Face recognition models not loaded yet.");
      return;
    }

    // Check and request permissions if needed
    if (!cameraPermission || !micPermission) {
      setStatusMessage("Please grant camera and microphone permissions first.");
      await requestPermissions();
      if (!cameraPermission || !micPermission) {
        return; // Still no permissions
      }
    }

    setSafeState("unlocking");
    setStatusMessage("Scanning face...");

    await startVideo();

    // Wait a moment for video to stabilize
    setTimeout(async () => {
      const imageData = await captureAndProcess();
      if (!imageData) {
        setStatusMessage("Failed to capture image.");
        stopVideo();
        setSafeState("locked");
        return;
      }

      try {
        if (!videoRef.current) {
          setStatusMessage("Camera not available.");
          stopVideo();
          setSafeState("locked");
          return;
        }

        // Detect face and compute descriptor client-side
        const detection = await faceapi
          .detectSingleFace(
            videoRef.current,
            new faceapi.TinyFaceDetectorOptions()
          )
          .withFaceLandmarks()
          .withFaceDescriptor();

        if (!detection) {
          setStatusMessage(
            "No face detected. Please position your face in the camera."
          );
          stopVideo();
          setSafeState("locked");
          return;
        }

        // Capture face image for logging (especially for unauthorized attempts)
        let capturedImage: string | null = null;
        if (canvasRef.current && videoRef.current) {
          canvasRef.current.width = videoRef.current.videoWidth;
          canvasRef.current.height = videoRef.current.videoHeight;
          const ctx = canvasRef.current.getContext("2d");
          if (ctx) {
            ctx.drawImage(videoRef.current, 0, 0);
            // Extract face region from detection box
            const box = detection.detection.box;
            const faceCanvas = document.createElement("canvas");
            faceCanvas.width = Math.min(box.width, videoRef.current.videoWidth);
            faceCanvas.height = Math.min(
              box.height,
              videoRef.current.videoHeight
            );
            const faceCtx = faceCanvas.getContext("2d");
            if (faceCtx) {
              // Draw the face region from the main canvas
              faceCtx.drawImage(
                canvasRef.current,
                Math.max(0, box.x),
                Math.max(0, box.y),
                Math.min(box.width, videoRef.current.videoWidth - box.x),
                Math.min(box.height, videoRef.current.videoHeight - box.y),
                0,
                0,
                faceCanvas.width,
                faceCanvas.height
              );
              capturedImage = faceCanvas.toDataURL("image/jpeg", 0.8);
            }
          }
        }

        // Send descriptor to server for recognition
        const descriptor = Array.from(detection.descriptor);
        const response = await fetch("/api/face/recognize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ descriptor, capturedImage }),
        });

        if (!response.ok) {
          // Face not recognized - image already sent to API for logging
          setStatusMessage("Face not recognized. Access denied.");
          stopVideo();
          setSafeState("locked");
          return;
        }

        const { userId } = await response.json();

        // Store userId for PIN verification
        localStorage.setItem("recognizedUserId", userId);

        // Face recognized, now ask for PIN
        setStatusMessage("Face recognized. Please enter your PIN below.");
        setPin(""); // Clear previous PIN input
        // Keep video running, we'll continue after PIN entry
        // The UI will show PIN input field automatically
      } catch (error) {
        console.error("Unlock error:", error);
        setStatusMessage("Error during unlock process.");
        stopVideo();
        setSafeState("locked");
      }
    }, 1000);
  };

  // Handle lock
  const handleLock = async () => {
    stopVideo();
    setSafeState("locked");
    setStatusMessage("Safe locked");
    // Lock with motor
    await fetch(`${process.env.NEXT_PUBLIC_ESP32_URL}-90`);
    // Log lock event
    await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "lock" }),
    });
  };

  // Handle setup
  const handleSetup = async () => {
    if (!modelsLoaded) {
      setStatusMessage("Face recognition models not loaded yet.");
      return;
    }

    // Check and request permissions if needed
    if (!cameraPermission || !micPermission) {
      setStatusMessage("Please grant camera and microphone permissions first.");
      await requestPermissions();
      if (!cameraPermission || !micPermission) {
        return; // Still no permissions
      }
    }

    setSafeState("setup");
    setSetupMode("face");
    setStatusMessage("Setup: Capture your face");
    setSetupUserId(null); // Reset setup userId when starting new setup
    await startVideo();
  };

  // Complete face setup
  const completeFaceSetup = async () => {
    if (!videoRef.current || !modelsLoaded) {
      setStatusMessage("Camera or models not ready");
      return;
    }

    try {
      // Detect face and compute descriptor client-side
      const detection = await faceapi
        .detectSingleFace(
          videoRef.current,
          new faceapi.TinyFaceDetectorOptions()
        )
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!detection) {
        setStatusMessage(
          "No face detected. Please position your face in the camera."
        );
        return;
      }

      // Get current user ID (in production, from auth)
      // Use existing setupUserId if available, otherwise create/get one
      const userId =
        setupUserId || localStorage.getItem("userId") || "user-" + Date.now();
      localStorage.setItem("userId", userId);
      setSetupUserId(userId); // Store in state for consistency

      // Send descriptor array to server (not the image)
      const descriptor = Array.from(detection.descriptor);

      const response = await fetch("/api/face/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, descriptor }),
      });

      if (response.ok) {
        setSetupMode("pin");
        setStatusMessage("Face registered. Now set your PIN.");
      } else {
        const errorData = await response.json();
        setStatusMessage(errorData.error || "Failed to register face.");
      }
    } catch (error) {
      console.error("Setup error:", error);
      setStatusMessage(
        "Error during setup: " +
          (error instanceof Error ? error.message : "Unknown error")
      );
    }
  };

  // Record phrase
  const startRecording = async () => {
    try {
      // Check if mediaDevices API is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setStatusMessage(
          "Microphone access not available. Please check your browser support."
        );
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error("Recording error:", error);
      const err = error as Error & { name?: string };
      if (
        err.name === "NotAllowedError" ||
        err.name === "PermissionDeniedError"
      ) {
        setStatusMessage(
          "Microphone permission denied. Please grant microphone access."
        );
      } else {
        setStatusMessage(
          "Error accessing microphone: " + (err.message || "Unknown error")
        );
      }
    }
  };

  // Check if audio contains actual sound (not just silence)
  const hasAudioContent = async (audioBlob: Blob): Promise<boolean> => {
    try {
      const arrayBuffer = await audioBlob.arrayBuffer();
      const AudioContextClass =
        window.AudioContext ||
        (window as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioContextClass) {
        // Fallback: check blob size
        return audioBlob.size > 1000;
      }
      const audioContext = new AudioContextClass();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

      // Get audio data
      const channelData = audioBuffer.getChannelData(0); // Use first channel

      // Calculate RMS (Root Mean Square) to detect volume
      let sumSquares = 0;
      for (let i = 0; i < channelData.length; i++) {
        sumSquares += channelData[i] * channelData[i];
      }
      const rms = Math.sqrt(sumSquares / channelData.length);

      // Threshold: RMS > 0.01 means there's actual sound (not silence)
      // This value can be adjusted - lower = more sensitive, higher = less sensitive
      const threshold = 0.01;

      return rms > threshold;
    } catch (error) {
      console.error("Error analyzing audio:", error);
      // If analysis fails, check blob size as fallback
      return audioBlob.size > 1000; // At least 1KB of data
    }
  };

  const stopRecording = async (): Promise<boolean> => {
    return new Promise(async (resolve) => {
      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state !== "inactive"
      ) {
        mediaRecorderRef.current.onstop = async () => {
          setIsRecording(false);

          // Check if we have audio chunks
          if (audioChunksRef.current.length === 0) {
            resolve(false);
            return;
          }

          // Combine audio chunks into a single blob
          const audioBlob = new Blob(audioChunksRef.current, {
            type: "audio/webm",
          });

          // Verify that the audio contains actual sound
          const hasSound = await hasAudioContent(audioBlob);
          resolve(hasSound);
        };
        mediaRecorderRef.current.stop();
        if (mediaRecorderRef.current.stream) {
          mediaRecorderRef.current.stream
            .getTracks()
            .forEach((track) => track.stop());
        }
      } else {
        resolve(false);
      }
    });
  };

  // Complete PIN setup
  const completePinSetup = async () => {
    if (!setupPin || setupPin.length < 4) {
      setStatusMessage("PIN must be at least 4 digits.");
      return;
    }

    if (setupPin !== confirmPin) {
      setStatusMessage("PINs do not match. Please try again.");
      setSetupPin("");
      setConfirmPin("");
      return;
    }

    // PIN is valid, move to phrase setup
    setSetupMode("phrase");
    setStatusMessage("PIN set. Now record your phrase.");
  };

  // Complete phrase setup
  const completePhraseSetup = async () => {
    await startRecording();
    setStatusMessage("Recording phrase...");

    setTimeout(async () => {
      const hasAudio = await stopRecording();

      if (hasAudio) {
        // Use setupUserId from state (set during face registration) to ensure consistency
        const userId = setupUserId || localStorage.getItem("userId");

        if (userId) {
          // Send PIN and voice phrase to server
          const response = await fetch("/api/face/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userId,
              pin: setupPin,
              voicePhrase: phrase,
            }),
          });

          if (response.ok) {
            setStatusMessage("Setup complete! You can now unlock the safe.");
            stopVideo();
            setSafeState("locked");
            setSetupMode("face");
            setSetupPin("");
            setConfirmPin("");
            setPhrase("");
            setSetupUserId(null); // Clear setup userId
          } else {
            const errorData = await response.json();
            setStatusMessage(
              errorData.error || "Failed to complete setup. Please try again."
            );
          }
        } else {
          setStatusMessage("User ID not found. Please start setup again.");
        }
      } else {
        setStatusMessage("No audio detected. Please speak your phrase.");
      }
    }, 10000);
  };

  // Check if running in secure context (HTTPS required for camera/mic)
  // Note: Mobile browsers treat IP addresses as insecure, even on HTTP
  // Only localhost/127.0.0.1 work on HTTP for mobile browsers
  const isSecureContext =
    typeof window !== "undefined" &&
    (window.isSecureContext ||
      location.protocol === "https:" ||
      location.hostname === "localhost" ||
      location.hostname === "127.0.0.1");

  // Check if accessing via IP address (not secure on mobile browsers)
  const isIPAddress =
    typeof window !== "undefined" &&
    /^\d+\.\d+\.\d+\.\d+$/.test(location.hostname);

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 text-white flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        <h1 className="text-3xl font-bold text-center mb-8">Smart Safe</h1>

        {/* HTTPS Warning */}
        {!isSecureContext && (
          <div className="bg-red-900 bg-opacity-50 border border-red-500 rounded-lg p-4 mb-4 text-center">
            <p className="text-red-200 text-sm mb-2 font-semibold">
              ⚠️ Camera and microphone require secure connection on mobile
              devices.
            </p>
            {isIPAddress ? (
              <div className="text-red-200 text-xs space-y-2 mt-3">
                <p>
                  You&apos;re accessing via IP address (http://
                  {typeof window !== "undefined" ? location.hostname : "..."}:
                  {typeof window !== "undefined" ? location.port : "3000"}).
                </p>
                <p className="font-semibold mt-3">Solutions:</p>
                <div className="text-left mt-2 space-y-2 bg-black bg-opacity-30 p-3 rounded">
                  <div>
                    <p className="font-semibold mb-1">
                      Option 1: Use ngrok (recommended)
                    </p>
                    <code className="bg-gray-900 px-2 py-1 rounded block text-xs mt-1">
                      ngrok http 3000
                    </code>
                    <p className="text-xs mt-1">
                      Then use the HTTPS URL ngrok provides
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold mb-1">
                      Option 2: Use localtunnel
                    </p>
                    <code className="bg-gray-900 px-2 py-1 rounded block text-xs mt-1">
                      npx localtunnel --port 3000
                    </code>
                    <p className="text-xs mt-1">
                      Then use the HTTPS URL provided
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold mb-1">
                      Option 3: Test on laptop
                    </p>
                    <p className="text-xs">Access from your laptop at:</p>
                    <code className="bg-gray-900 px-2 py-1 rounded block text-xs mt-1">
                      http://localhost:3000/safe
                    </code>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-red-200 text-xs mt-2">
                Please access this site via HTTPS.
              </p>
            )}
          </div>
        )}

        {/* MediaDevices API Warning */}
        {typeof window !== "undefined" && !navigator.mediaDevices && (
          <div className="bg-red-900 bg-opacity-50 border border-red-500 rounded-lg p-4 mb-4 text-center">
            <p className="text-red-200 text-sm">
              ⚠️ Your browser doesn&apos;t support camera/microphone access.
              {!isSecureContext && " Make sure you&apos;re using HTTPS."}
            </p>
          </div>
        )}

        {/* Status Message */}
        {statusMessage && (
          <div className="bg-blue-900 bg-opacity-50 border border-blue-500 rounded-lg p-4 mb-4 text-center">
            {statusMessage}
          </div>
        )}

        {/* Permission Status */}
        <div className="mb-4 text-sm text-gray-400">
          Camera:{" "}
          {cameraPermission === null
            ? "Checking..."
            : cameraPermission
            ? "✓"
            : "✗"}
          {" | "}
          Mic:{" "}
          {micPermission === null ? "Checking..." : micPermission ? "✓" : "✗"}
        </div>

        {/* Request Permissions Button */}
        {(!cameraPermission || !micPermission) && (
          <div className="mb-4">
            <div className="bg-red-900 bg-opacity-50 border border-red-500 rounded-lg p-4 mb-4 text-center">
              <p className="text-red-200 mb-3">
                Camera and microphone permissions are required to use the safe.
              </p>
              <button
                onClick={requestPermissions}
                className="w-full bg-red-600 hover:bg-red-700 rounded-lg p-3 font-bold text-white"
              >
                Grant Permissions
              </button>
            </div>
          </div>
        )}

        {/* Video Preview or Slideshow */}
        <div
          className="relative mb-4 bg-black rounded-lg overflow-hidden"
          style={{ aspectRatio: "4/3" }}
        >
          {safeState === "unlocked" ? (
            // Slideshow when unlocked
            <div className="relative w-full h-full">
              {slideshowImages.map((image, index) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={image}
                  src={image}
                  alt={`Safe contents ${index + 1}`}
                  className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ${
                    index === slideshowIndex ? "opacity-100" : "opacity-0"
                  }`}
                />
              ))}
            </div>
          ) : (
            // Video when locked/unlocking/setup
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              <canvas ref={canvasRef} className="hidden" />
            </>
          )}
        </div>

        {/* PIN Input for Unlock */}
        {safeState === "unlocking" && (
          <div className="mb-4">
            <div className="bg-yellow-900 bg-opacity-50 border border-yellow-500 rounded-lg p-4 mb-4">
              <label className="block text-yellow-300 text-sm mb-2">
                Enter your PIN:
              </label>
              <input
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                placeholder="Enter PIN"
                maxLength={10}
                className="w-full bg-gray-700 text-white rounded-lg p-3 mb-3 text-center text-2xl font-mono"
                autoFocus
              />
              <button
                onClick={async () => {
                  if (!pin || pin.length < 4) {
                    setStatusMessage(
                      "Please enter a valid PIN (at least 4 digits)."
                    );
                    return;
                  }

                  // Get userId from recognition (stored in state or fetch)
                  const userId = localStorage.getItem("recognizedUserId");
                  if (!userId) {
                    setStatusMessage("Face recognition required first.");
                    return;
                  }

                  console.log(
                    `Verifying PIN for userId: ${userId}, PIN length: ${pin.length}`
                  );

                  // Verify PIN
                  const pinResponse = await fetch("/api/face/verify-pin", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ userId, pin }),
                  });

                  if (!pinResponse.ok) {
                    const errorData = await pinResponse
                      .json()
                      .catch(() => ({ error: "Unknown error" }));
                    console.error(
                      `PIN verification failed: ${errorData.error} for userId: ${userId}`
                    );
                    setStatusMessage(
                      `Invalid PIN. ${errorData.error || "Access denied."}`
                    );
                    setPin("");
                    stopVideo();
                    setSafeState("locked");
                    localStorage.removeItem("recognizedUserId");
                    return;
                  }

                  // PIN verified, now verify voice
                  setStatusMessage(
                    "PIN verified. Please speak your phrase now."
                  );
                  await startRecording();

                  setTimeout(async () => {
                    const hasAudio = await stopRecording();

                    if (hasAudio) {
                      setStatusMessage(
                        "Verification successful! Unlocking safe..."
                      );

                      // Log unlock event (don't await - fire and forget)
                      fetch("/api/events", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          type: "unlock",
                          userId,
                          metadata: { verified: "face+pin+voice" },
                        }),
                      }).catch((err) =>
                        console.error("Error logging event:", err)
                      );

                      // Unlock with motor (don't await - fire and forget)
                      const esp32Url = process.env.NEXT_PUBLIC_ESP32_URL;
                      if (esp32Url) {
                        fetch(`${esp32Url}90`, { method: "GET" }).catch(
                          (err) => {
                            console.error("Error unlocking motor:", err);
                          }
                        );
                      }

                      // Immediately transition to unlocked state
                      stopVideo();
                      setSafeState("unlocked");
                      setStatusMessage("Safe unlocked");
                      setPin("");
                      localStorage.removeItem("recognizedUserId");
                    } else {
                      setStatusMessage(
                        "No audio detected. Please speak your phrase."
                      );
                      setPin("");
                      stopVideo();
                      setSafeState("locked");
                      localStorage.removeItem("recognizedUserId");
                    }
                  }, 3000);
                }}
                disabled={!pin || pin.length < 4}
                className="w-full bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg p-3 font-bold"
              >
                Verify PIN & Voice
              </button>
            </div>
          </div>
        )}

        {/* Setup Mode */}
        {safeState === "setup" && (
          <div className="mb-4">
            {setupMode === "face" ? (
              <div>
                <p className="text-center mb-4">
                  Position your face in the camera
                </p>
                <button
                  onClick={completeFaceSetup}
                  className="w-full bg-green-600 hover:bg-green-700 rounded-lg p-4 font-bold"
                >
                  Capture Face
                </button>
              </div>
            ) : setupMode === "pin" ? (
              <div>
                <p className="text-center mb-4 text-sm text-gray-300">
                  Set a PIN (minimum 4 digits)
                </p>
                <input
                  type="password"
                  value={setupPin}
                  onChange={(e) =>
                    setSetupPin(e.target.value.replace(/\D/g, ""))
                  }
                  placeholder="Enter PIN"
                  maxLength={10}
                  className="w-full bg-gray-700 text-white rounded-lg p-3 mb-3 text-center text-xl font-mono"
                />
                <input
                  type="password"
                  value={confirmPin}
                  onChange={(e) =>
                    setConfirmPin(e.target.value.replace(/\D/g, ""))
                  }
                  placeholder="Confirm PIN"
                  maxLength={10}
                  className="w-full bg-gray-700 text-white rounded-lg p-3 mb-4 text-center text-xl font-mono"
                />
                <button
                  onClick={completePinSetup}
                  disabled={!setupPin || setupPin.length < 4}
                  className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg p-4 font-bold"
                >
                  Set PIN
                </button>
              </div>
            ) : (
              <div>
                <input
                  type="text"
                  value={phrase}
                  onChange={(e) => setPhrase(e.target.value)}
                  placeholder="Enter your phrase"
                  className="w-full bg-gray-700 rounded-lg p-3 mb-4 text-white"
                />
                <button
                  onClick={completePhraseSetup}
                  className="w-full bg-green-600 hover:bg-green-700 rounded-lg p-4 font-bold"
                >
                  Record Phrase
                </button>
              </div>
            )}
          </div>
        )}

        {/* Main Controls */}
        <div className="space-y-3">
          {safeState === "locked" && (
            <>
              <button
                onClick={handleUnlock}
                disabled={!modelsLoaded || !cameraPermission}
                className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg p-6 font-bold text-xl"
              >
                Unlock Safe
              </button>
              <button
                onClick={handleSetup}
                disabled={!modelsLoaded || !cameraPermission}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg p-4 font-bold"
              >
                Setup / Enroll
              </button>
            </>
          )}

          {safeState === "unlocked" && (
            <button
              onClick={handleLock}
              className="w-full bg-red-600 hover:bg-red-700 rounded-lg p-6 font-bold text-xl"
            >
              Lock Safe
            </button>
          )}

          {safeState === "unlocking" && (
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
              <p>Verifying identity...</p>
            </div>
          )}
        </div>

        {/* Recording Indicator */}
        {isRecording && (
          <div className="mt-4 text-center">
            <div className="inline-flex items-center">
              <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse mr-2"></div>
              <span className="text-red-400">Recording...</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
