
import { createRemoteJWKSet, jwtVerify } from "jose";

const authBaseURL = process.env.BETTER_AUTH_URL?.replace(/\/+$/, "");

if (!authBaseURL) {
  throw new Error(
    "BETTER_AUTH_URL is missing from backend environment variables"
  );
}

// Better Auth public JWKS endpoint
const JWKS = createRemoteJWKSet(
  new URL(`${authBaseURL}/api/auth/jwks`)
);

const requireAuth = async (req, res, next) => {
  const authorization = req.headers.authorization || "";
  const [scheme, token] = authorization.split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized! Please login first.",
    });
  }

  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: authBaseURL,
      audience: authBaseURL,
    });

    const userId = payload.sub;

    if (typeof userId !== "string" || !userId) {
      return res.status(401).json({
        success: false,
        message: "Invalid authentication token.",
      });
    }

    req.user = {
      id: userId,
      name:
        typeof payload.name === "string"
          ? payload.name
          : "Unknown User",
      email:
        typeof payload.email === "string"
          ? payload.email.toLowerCase()
          : "",
    };

    return next();
  } catch (error) {
    console.error("JWT verification failed:", error);

    const code = error?.code || "";
    const isKeyServiceError =
      code.startsWith("ERR_JWKS") || code === "ERR_NETWORK";

    return res.status(isKeyServiceError ? 503 : 401).json({
      success: false,
      message: isKeyServiceError
        ? "Authentication service is temporarily unavailable."
        : "Invalid or expired authentication token. Please login again.",
    });
  }
};

export default requireAuth;
