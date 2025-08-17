import jwt from "jsonwebtoken";
import dotenv from "dotenv";
dotenv.config();

export function verifyToken(req, res, next) {
  // Get token from Authorization header: "Bearer <token>"
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res
      .status(401)
      .json({ message: "Access denied. No token provided." });
  }

  const token = authHeader.split(" ")[1]; // Extract token part after "Bearer"

  if (!token) {
    return res.status(401).json({ message: "Access denied. Token missing." });
  }

  try {
    // Verify token and store decoded payload in req.user for later use
    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ["HS512"],
    });
    req.user = decoded;
    next(); // Token valid, proceed to the next middleware/route handler
  } catch (err) {
    return res.status(401).json({ message: "Invalid token." });
  }
}
