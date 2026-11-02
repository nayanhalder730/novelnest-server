
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../auth.js";

const requireAuth = async (req, res, next) => {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    // Check whether the user has a valid session.
    if (!session?.user || !session?.session) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized! Please login first.",
      });
    }

    // Attach authenticated user information to request.
    req.user = {
      id: session.user.id,
      name: session.user.name || "Unknown User",
      email: session.user.email?.toLowerCase() || "",
    };

    req.session = session.session;

    next();
  } catch (error) {
    console.error("Authentication middleware error:", error);

    return res.status(500).json({
      success: false,
      message: "Authentication service error.",
    });
  }
};

export default requireAuth;
