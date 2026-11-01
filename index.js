
import express from "express";
import "dotenv/config";
import { MongoClient } from "mongodb";
import cors from "cors";
import multer from "multer";

const app = express();
const port = process.env.PORT || 8000;

// Middleware
app.use(
  cors({
    origin: process.env.CLIENT_SITE_URL || "http://localhost:3000",
  })
);

app.use(express.json());

// Multer Configuration
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only JPG, PNG and WEBP images are allowed"));
    }
  },
});

// MongoDB Connection
const client = new MongoClient(process.env.MONGODB_URI);

async function connectToMongoDB() {
  try {
    await client.connect();

    console.log("Successfully connected to MongoDB!");

    const db = client.db(process.env.DB_NAME || "novelnest");

    return db.collection("books");
  } catch (error) {
    console.error("MongoDB Connection Error:", error);
    throw error;
  }
}

const booksCollection = await connectToMongoDB();

// POST API - Add Book
app.post(
  "/addBooks",
  upload.single("image"),
  async (req, res) => {
    try {
      const {
        title,
        author,
        category,
        totalCopies,
        description,
        userName,
        userEmail,
      } = req.body;

      const image = req.file;

      // Required Field Validation
      if (
        !title ||
        !author ||
        !category ||
        !description ||
        !userName ||
        !userEmail
      ) {
        return res.status(400).send({
          success: false,
          message: "Required fields are missing",
        });
      }

      // Image Validation
      if (!image) {
        return res.status(400).send({
          success: false,
          message: "Book image is required",
        });
      }

      // Validate Total Copies if supplied
      if (
        totalCopies !== undefined &&
        (!Number.isInteger(Number(totalCopies)) ||
          Number(totalCopies) < 1)
      ) {
        return res.status(400).send({
          success: false,
          message: "Invalid total copies",
        });
      }

      // Book Data
    const bookData = {
  title,
  author,
  category,
  description,
  imageName: req.file.originalname,
  imageMimeType: req.file.mimetype,
  imageData: req.file.buffer, 
  userName,
  userEmail,
  createdAt: new Date(),
};

      // Optional totalCopies
      if (totalCopies !== undefined) {
        bookData.totalCopies = Number(totalCopies);
      }

      console.log("Received Book:", bookData);
      console.log("Received Image:", image.originalname);

      // Insert into MongoDB
      const result = await booksCollection.insertOne(bookData);

      res.status(201).send({
        success: true,
        message: "Book added successfully",
        insertedId: result.insertedId,
      });

    } catch (error) {
      console.error("ADD BOOK ERROR:", error);

      res.status(500).send({
        success: false,
        message: error.message || "Internal server error",
      });
    }
  }
);

// Multer Error Handler
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    return res.status(400).send({
      success: false,
      message:
        error.code === "LIMIT_FILE_SIZE"
          ? "Image size must be less than 5MB"
          : error.message,
    });
  }

  if (error) {
    return res.status(400).send({
      success: false,
      message: error.message,
    });
  }

  next();
});
// GET API - Get All Books
app.get("/allBooks", async (req, res) => {
  try {
    const books = await booksCollection
      .find({}, { projection: { imageData: 0 } })
      .sort({ createdAt: -1 })
      .toArray();

    res.status(200).send({
      success: true,
      count: books.length,
      data: books,
    });
  } catch (error) {
    res.status(500).send({
      success: false,
      message: "Failed to fetch books",
    });
  }
});
// Test API
app.get("/", (req, res) => {
  res.send("NovelNest Server is Running!");
});

// Start Server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
