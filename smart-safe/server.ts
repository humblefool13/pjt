// Custom Next.js server with Socket.io support
import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { Server as SocketIOServer } from "socket.io";

const dev = process.env.NODE_ENV !== "production";
const hostname = "localhost";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

interface SensorData {
  accelerometer: { x: number; y: number; z: number };
  gyroscope: { x: number; y: number; z: number };
  timestamp: number;
}

app.prepare().then(() => {
  const httpServer = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url!, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error("Error occurred handling", req.url, err);
      res.statusCode = 500;
      res.end("Internal server error");
    }
  });

  const io = new SocketIOServer(httpServer, {
    path: "/api/socket",
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  // Store sensor data from all connected clients
  const sensorDataStore: SensorData[] = [];

  io.on("connection", (socket: any) => {
    console.log("Client connected:", socket.id);

    // Receive sensor data from mobile clients
    socket.on("sensor-data", (data: SensorData) => {
      sensorDataStore.push(data);

      // Keep only last 100 data points per client
      if (sensorDataStore.length > 100) {
        sensorDataStore.shift();
      }

      // Broadcast to all admin dashboard clients
      io.emit("sensor-data", data);

      // Theft detection logic
      const accelMagnitude = Math.sqrt(
        data.accelerometer.x ** 2 +
          data.accelerometer.y ** 2 +
          data.accelerometer.z ** 2
      );

      if (accelMagnitude > 50) {
        console.log("Theft detected! High acceleration:", accelMagnitude);
        io.emit("theft-alert", {
          magnitude: accelMagnitude,
          timestamp: Date.now(),
        });
      }

      // Ghost mode detection (very low activity)
      if (
        accelMagnitude < 0.1 &&
        Math.abs(data.gyroscope.x) < 0.1 &&
        Math.abs(data.gyroscope.y) < 0.1 &&
        Math.abs(data.gyroscope.z) < 0.1
      ) {
        io.emit("ghost-mode-alert", {
          timestamp: Date.now(),
        });
      }
    });

    socket.on("disconnect", () => {
      console.log("Client disconnected:", socket.id);
    });
  });

  httpServer
    .once("error", (err) => {
      console.error(err);
      process.exit(1);
    })
    .listen(port, () => {
      console.log(`> Ready on http://${hostname}:${port}`);
    });
});
