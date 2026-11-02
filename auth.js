
import "dotenv/config";
import { MongoClient } from "mongodb";
import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";

if (!process.env.MONGODB_URI) {
  throw new Error("MONGODB_URI is missing in environment variables");
}

if (!process.env.BETTER_AUTH_SECRET) {
  throw new Error("BETTER_AUTH_SECRET is missing in environment variables");
}

if (!process.env.BETTER_AUTH_URL) {
  throw new Error("BETTER_AUTH_URL is missing in environment variables");
}

const client = new MongoClient(process.env.MONGODB_URI);

export const db = client.db(process.env.DB_NAME || "novelnest");

// Prevent multiple simultaneous connection attempts.
let connectionPromise = null;

export const connectDB = async () => {
  if (!connectionPromise) {
    connectionPromise = client.connect().then(() => {
      console.log("MongoDB connected successfully");
    }).catch((error) => {
      connectionPromise = null;
      console.error("MongoDB connection failed:", error);
      throw error;
    });
  }

  return connectionPromise;
};

const trustedOrigins = (
  process.env.CLIENT_SITE_URL || "http://localhost:3000"
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

export const auth = betterAuth({
  database: mongodbAdapter(db),

  secret: process.env.BETTER_AUTH_SECRET,

  baseURL: process.env.BETTER_AUTH_URL,

  trustedOrigins,

  emailAndPassword: {
    enabled: true,
  },
});
