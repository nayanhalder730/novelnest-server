
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../auth.js";

const requireAuth = async (req, res, next) => {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    if (!session?.user) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized! Please login first.",
      });
    }

    req.user = {
      id: session.user.id,
      name: session.user.name || "Unknown User",
      email: session.user.email?.toLowerCase() || "",
    };

    req.session = session.session;

    return next();
  } catch (error) {
    console.error("Authentication error:", error);

    return res.status(500).json({
      success: false,
      message: "Authentication service error.",
    });
  }
};

export default requireAuth;
