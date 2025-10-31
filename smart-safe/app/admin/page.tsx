"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { io, Socket } from "socket.io-client";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import { Line } from "react-chartjs-2";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

interface Event {
  id: string;
  type: string;
  userId?: string;
  userName?: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

interface User {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
  createdAt: string;
}

interface SensorData {
  accelerometer: { x: number; y: number; z: number };
  gyroscope: { x: number; y: number; z: number };
  timestamp: number;
}

export default function AdminDashboard() {
  const router = useRouter();
  const [events, setEvents] = useState<Event[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [activeTab, setActiveTab] = useState<"dashboard" | "events" | "users">(
    "dashboard"
  );
  const [accidentCount, setAccidentCount] = useState(0);
  const [ghostMode, setGhostMode] = useState(false);
  const [theftDetected, setTheftDetected] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  // Smoothing buffers for accelerometer (reduce noise, especially on Z-axis)
  const accelBufferRef = useRef<{ x: number[]; y: number[]; z: number[] }>({
    x: [],
    y: [],
    z: [],
  });
  // Cooldown for movement detection events (prevent spam)
  const lastMovementEventRef = useRef<number>(0);
  const MOVEMENT_EVENT_COOLDOWN = 5000; // 5 seconds between events
  const [accelData, setAccelData] = useState<{
    labels: string[];
    datasets: any[];
  }>({
    labels: [],
    datasets: [
      { label: "X", borderColor: "#ff6384", data: [] },
      { label: "Y", borderColor: "#36a2eb", data: [] },
      { label: "Z", borderColor: "#ffcd56", data: [] },
    ],
  });
  const [gyroData, setGyroData] = useState<{
    labels: string[];
    datasets: any[];
  }>({
    labels: [],
    datasets: [
      { label: "X", borderColor: "#4bc0c0", data: [] },
      { label: "Y", borderColor: "#9966ff", data: [] },
      { label: "Z", borderColor: "#ff9f40", data: [] },
    ],
  });

  // Authentication is handled by middleware, no client-side check needed
  // If user reaches here, they are authenticated (middleware would have redirected otherwise)

  // Smooth accelerometer values using moving average (reduces noise)
  const smoothAccelerometer = (
    x: number,
    y: number,
    z: number
  ): { x: number; y: number; z: number } => {
    const bufferSize = 5; // Number of samples to average

    // Add new values to buffer
    accelBufferRef.current.x.push(x);
    accelBufferRef.current.y.push(y);
    accelBufferRef.current.z.push(z);

    // Keep buffer size limited
    if (accelBufferRef.current.x.length > bufferSize) {
      accelBufferRef.current.x.shift();
      accelBufferRef.current.y.shift();
      accelBufferRef.current.z.shift();
    }

    // Calculate average
    const avgX =
      accelBufferRef.current.x.reduce((a, b) => a + b, 0) /
      accelBufferRef.current.x.length;
    const avgY =
      accelBufferRef.current.y.reduce((a, b) => a + b, 0) /
      accelBufferRef.current.y.length;
    const avgZ =
      accelBufferRef.current.z.reduce((a, b) => a + b, 0) /
      accelBufferRef.current.z.length;

    return { x: avgX, y: avgY, z: avgZ - 5 };
  };

  // Handle sensor data from Socket.io or WebSocket
  const handleSensorData = (data: SensorData) => {
    const time = new Date(data.timestamp).toLocaleTimeString();

    // Smooth accelerometer data to reduce noise (especially Z-axis)
    const smoothed = smoothAccelerometer(
      data.accelerometer.x,
      data.accelerometer.y,
      data.accelerometer.z
    );

    // Update accelerometer chart
    setAccelData((prev) => {
      const newLabels = [...prev.labels, time];
      const newDatasets = prev.datasets.map((dataset, idx) => ({
        ...dataset,
        data: [
          ...dataset.data,
          idx === 0 ? smoothed.x : idx === 1 ? smoothed.y : smoothed.z,
        ],
      }));

      // Limit data points
      if (newLabels.length > 20) {
        newLabels.shift();
        newDatasets.forEach((dataset) => dataset.data.shift());
      }

      return { labels: newLabels, datasets: newDatasets };
    });

    // Update gyroscope chart only if gyroscope data exists
    if (
      data.gyroscope.x !== 0 ||
      data.gyroscope.y !== 0 ||
      data.gyroscope.z !== 0
    ) {
      setGyroData((prev) => {
        const newLabels = [...prev.labels, time];
        const newDatasets = prev.datasets.map((dataset, idx) => ({
          ...dataset,
          data: [
            ...dataset.data,
            idx === 0
              ? data.gyroscope.x
              : idx === 1
              ? data.gyroscope.y
              : data.gyroscope.z,
          ],
        }));

        // Limit data points
        if (newLabels.length > 20) {
          newLabels.shift();
          newDatasets.forEach((dataset) => dataset.data.shift());
        }

        return { labels: newLabels, datasets: newDatasets };
      });
    }

    // Accident detection (use original unsmoothed data for accurate detection)
    const accelMagnitude = Math.sqrt(
      data.accelerometer.x ** 2 +
        data.accelerometer.y ** 2 +
        data.accelerometer.z ** 2
    );
    if (accelMagnitude > 50) {
      setAccidentCount((prev) => prev + 1);
      setTheftDetected(true);
      fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "theft_detected",
          metadata: { magnitude: accelMagnitude },
        }),
      });
    }

    // Movement detection: Accelerometer X or Y > 5 or < -5, OR Gyroscope > 2 or < -2
    const now = Date.now();
    const accelXExceeded = Math.abs(data.accelerometer.x) > 5;
    const accelYExceeded = Math.abs(data.accelerometer.y) > 5;
    const gyroXExceeded = Math.abs(data.gyroscope.x) > 2;
    const gyroYExceeded = Math.abs(data.gyroscope.y) > 2;
    const gyroZExceeded = Math.abs(data.gyroscope.z) > 2;

    if (
      (accelXExceeded ||
        accelYExceeded ||
        gyroXExceeded ||
        gyroYExceeded ||
        gyroZExceeded) &&
      now - lastMovementEventRef.current > MOVEMENT_EVENT_COOLDOWN
    ) {
      lastMovementEventRef.current = now;

      const metadata: Record<string, any> = {};
      if (accelXExceeded) metadata.accelX = data.accelerometer.x;
      if (accelYExceeded) metadata.accelY = data.accelerometer.y;
      if (gyroXExceeded) metadata.gyroX = data.gyroscope.x;
      if (gyroYExceeded) metadata.gyroY = data.gyroscope.y;
      if (gyroZExceeded) metadata.gyroZ = data.gyroscope.z;

      fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "movement_detected",
          metadata,
        }),
      });
    }
  };

  // Load events and users
  useEffect(() => {
    const loadData = async () => {
      try {
        const [eventsRes, usersRes] = await Promise.all([
          fetch("/api/events?limit=100"),
          fetch("/api/users"),
        ]);

        if (eventsRes.ok) {
          const data = await eventsRes.json();
          setEvents(data.events);
        }

        if (usersRes.ok) {
          const data = await usersRes.json();
          setUsers(data.users);
        }
      } catch (error) {
        console.error("Error loading data:", error);
      }
    };
    loadData();

    // Refresh events every 3 seconds to show new events
    const interval = setInterval(loadData, 3000);

    return () => clearInterval(interval);
  }, []);

  // WebSocket connection for sensor data - supports both Socket.io and native WebSocket
  useEffect(() => {
    if (typeof window !== "undefined") {
      // Connect via Socket.io (from Safe UI)
      const socket = io(
        process.env.NEXT_PUBLIC_WS_URL || "http://localhost:3000",
        {
          path: "/api/socket",
        }
      );

      socketRef.current = socket;

      socket.on("connect", () => {
        console.log("Connected to sensor server (Socket.io)");
      });

      socket.on("sensor-data", (data: SensorData) => {
        handleSensorData(data);
      });

      // Also connect to native WebSocket (like index.html) if available
      // Update the IP address to match your sensor server
      const sensorServerUrl =
        process.env.NEXT_PUBLIC_SENSOR_SERVER || "ws://192.168.1.2:8080";

      // Accelerometer WebSocket
      const accelSocket = new WebSocket(
        `${sensorServerUrl}/sensor/connect?type=android.sensor.accelerometer`
      );

      accelSocket.onopen = () => {
        console.log("Connected to Accelerometer Sensor (WebSocket)");
      };

      accelSocket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const values = data.values;
          if (values && values.length >= 3) {
            handleSensorData({
              accelerometer: {
                x: values[0] || 0,
                y: values[1] || 0,
                z: values[2] || 0,
              },
              gyroscope: {
                x: 0,
                y: 0,
                z: 0,
              },
              timestamp: Date.now(),
            });
          }
        } catch (error) {
          console.error("Error parsing accelerometer data:", error);
        }
      };

      accelSocket.onerror = (error) => {
        console.error("Accelerometer WebSocket Error:", error);
      };

      accelSocket.onclose = () => {
        console.log("Disconnected from Accelerometer WebSocket");
      };

      // Gyroscope WebSocket
      const gyroSocket = new WebSocket(
        `${sensorServerUrl}/sensor/connect?type=android.sensor.gyroscope`
      );

      gyroSocket.onopen = () => {
        console.log("Connected to Gyroscope Sensor (WebSocket)");
      };

      gyroSocket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const values = data.values;
          if (values && values.length >= 3) {
            // Update gyroscope data using handleSensorData function
            handleSensorData({
              accelerometer: {
                x: 0,
                y: 0,
                z: 0,
              },
              gyroscope: {
                x: values[0] || 0,
                y: values[1] || 0,
                z: values[2] || 0,
              },
              timestamp: Date.now(),
            });
          }
        } catch (error) {
          console.error("Error parsing gyroscope data:", error);
        }
      };

      gyroSocket.onerror = (error) => {
        console.error("Gyroscope WebSocket Error:", error);
      };

      gyroSocket.onclose = () => {
        console.log("Disconnected from Gyroscope WebSocket");
      };

      return () => {
        socket.disconnect();
        accelSocket.close();
        gyroSocket.close();
      };
    }
  }, []);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/admin/login");
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm("Are you sure you want to delete this user?")) return;

    const response = await fetch(`/api/users/${userId}`, { method: "DELETE" });
    if (response.ok) {
      setUsers((prev) => prev.filter((u) => u.id !== userId));
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 p-4">
        <div className="flex justify-between items-center max-w-7xl mx-auto">
          <h1 className="text-2xl font-bold">Admin Dashboard</h1>
          <button
            onClick={handleLogout}
            className="bg-red-600 hover:bg-red-700 rounded-lg px-4 py-2"
          >
            Logout
          </button>
        </div>
      </header>

      {/* Alert Banners */}
      {theftDetected && (
        <div className="bg-red-600 text-white p-4 text-center font-bold">
          {theftDetected && "⚠ Theft Detected! High acceleration detected."}
          {ghostMode &&
            !theftDetected &&
            "👻 Ghost Mode: Unusual low sensor activity."}
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="bg-gray-800 border-b border-gray-700">
        <div className="max-w-7xl mx-auto flex">
          <button
            onClick={() => setActiveTab("dashboard")}
            className={`px-6 py-3 font-medium ${
              activeTab === "dashboard"
                ? "bg-gray-700 border-b-2 border-blue-500"
                : ""
            }`}
          >
            Dashboard
          </button>
          <button
            onClick={() => setActiveTab("events")}
            className={`px-6 py-3 font-medium ${
              activeTab === "events"
                ? "bg-gray-700 border-b-2 border-blue-500"
                : ""
            }`}
          >
            Events
          </button>
          <button
            onClick={() => setActiveTab("users")}
            className={`px-6 py-3 font-medium ${
              activeTab === "users"
                ? "bg-gray-700 border-b-2 border-blue-500"
                : ""
            }`}
          >
            Users
          </button>
        </div>
      </div>

      {/* Content */}
      <main className="max-w-7xl mx-auto p-6">
        {activeTab === "dashboard" && (
          <div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-gray-800 rounded-lg p-4">
                <div className="text-gray-400 text-sm">Total Events</div>
                <div className="text-3xl font-bold">{events.length}</div>
              </div>
              <div className="bg-gray-800 rounded-lg p-4">
                <div className="text-gray-400 text-sm">Accidents Detected</div>
                <div className="text-3xl font-bold text-red-500">
                  {accidentCount}
                </div>
              </div>
              <div className="bg-gray-800 rounded-lg p-4">
                <div className="text-gray-400 text-sm">Authorized Users</div>
                <div className="text-3xl font-bold">{users.length}</div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-gray-800 rounded-lg p-6">
                <h2 className="text-xl font-bold mb-4">Accelerometer Data</h2>
                <div style={{ height: "300px", position: "relative" }}>
                  <Line
                    data={accelData}
                    options={{
                      responsive: true,
                      animation: false,
                      maintainAspectRatio: false,
                      scales: {
                        y: {
                          title: { display: true, text: "Acceleration (m/s²)" },
                          ticks: { color: "#fff" },
                          grid: { color: "#374151" },
                          min: -20,
                          max: 20,
                          suggestedMin: -15,
                          suggestedMax: 15,
                        },
                        x: {
                          title: { display: true, text: "Time" },
                          ticks: { color: "#fff" },
                          grid: { color: "#374151" },
                        },
                      },
                      plugins: {
                        legend: { labels: { color: "#fff" } },
                      },
                    }}
                  />
                </div>
              </div>

              <div className="bg-gray-800 rounded-lg p-6">
                <h2 className="text-xl font-bold mb-4">Gyroscope Data</h2>
                <div style={{ height: "300px", position: "relative" }}>
                  <Line
                    data={gyroData}
                    options={{
                      responsive: true,
                      animation: false,
                      maintainAspectRatio: false,
                      scales: {
                        y: {
                          title: {
                            display: true,
                            text: "Angular Velocity (rad/s)",
                          },
                          ticks: { color: "#fff" },
                          grid: { color: "#374151" },
                          min: -5,
                          max: 5,
                          suggestedMin: -3,
                          suggestedMax: 3,
                        },
                        x: {
                          title: { display: true, text: "Time" },
                          ticks: { color: "#fff" },
                          grid: { color: "#374151" },
                        },
                      },
                      plugins: {
                        legend: { labels: { color: "#fff" } },
                      },
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "events" && (
          <div className="bg-gray-800 rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-700">
                <tr>
                  <th className="px-4 py-3 text-left">Type</th>
                  <th className="px-4 py-3 text-left">User</th>
                  <th className="px-4 py-3 text-left">Timestamp</th>
                  <th className="px-4 py-3 text-left">Details</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.id} className="border-t border-gray-700">
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-1 rounded text-xs ${
                          event.type === "unlock"
                            ? "bg-green-900"
                            : event.type === "lock"
                            ? "bg-blue-900"
                            : event.type === "unauthorized_face"
                            ? "bg-red-900"
                            : event.type === "theft_detected"
                            ? "bg-red-600"
                            : event.type === "movement_detected"
                            ? "bg-yellow-600"
                            : event.type === "ghost_mode"
                            ? "bg-purple-900"
                            : event.type === "setup"
                            ? "bg-indigo-900"
                            : "bg-gray-700"
                        }`}
                      >
                        {event.type}
                      </span>
                    </td>
                    <td className="px-4 py-3">{event.userName || "N/A"}</td>
                    <td className="px-4 py-3 text-sm text-gray-400">
                      {new Date(event.timestamp).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-400">
                      {event.metadata ? JSON.stringify(event.metadata) : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === "users" && (
          <div className="bg-gray-800 rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-700">
                <tr>
                  <th className="px-4 py-3 text-left">Name</th>
                  <th className="px-4 py-3 text-left">Email</th>
                  <th className="px-4 py-3 text-left">Role</th>
                  <th className="px-4 py-3 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-t border-gray-700">
                    <td className="px-4 py-3">{user.name}</td>
                    <td className="px-4 py-3">{user.email}</td>
                    <td className="px-4 py-3">
                      {user.isAdmin ? (
                        <span className="px-2 py-1 bg-purple-900 rounded text-xs">
                          Admin
                        </span>
                      ) : (
                        <span className="px-2 py-1 bg-blue-900 rounded text-xs">
                          User
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleDeleteUser(user.id)}
                        className="bg-red-600 hover:bg-red-700 rounded px-3 py-1 text-sm"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
