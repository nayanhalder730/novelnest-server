
import "dotenv/config";
import { MongoClient } from "mongodb";
import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";

if (!process.env.MONGODB_URI) {
  throw new Error("MONGODB_URI is missing");
}

if (!process.env.BETTER_AUTH_SECRET) {
  throw new Error("BETTER_AUTH_SECRET is missing");
}

const client = new MongoClient(process.env.MONGODB_URI);

export const db = client.db(process.env.DB_NAME || "novelnest");

export const connectDB = async () => {
  await client.connect();
  console.log("MongoDB connected successfully");
};

export const auth = betterAuth({
  database: mongodbAdapter(db),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,

  trustedOrigins: [
    process.env.CLIENT_SITE_URL || "http://localhost:3000",
  ],

  emailAndPassword: {
    enabled: true,
  },
});
