
import express from "express";
import "dotenv/config";
import { MongoClient, ObjectId } from "mongodb";
import cors from "cors";
import multer from "multer";

const app = express();
const port = process.env.PORT || 8000;

// ===============================
// Middleware
// ===============================

app.use(
  cors({
    origin: process.env.CLIENT_SITE_URL || "http://localhost:3000",
  })
);

app.use(express.json());

// ===============================
// Multer Configuration
// ===============================

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // Maximum 5MB
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

// ===============================
// MongoDB Connection
// ===============================

if (!process.env.MONGODB_URI) {
  throw new Error("MONGODB_URI is missing from environment variables");
}

const client = new MongoClient(process.env.MONGODB_URI);

async function connectToMongoDB() {
  await client.connect();

  console.log("Successfully connected to MongoDB!");

  const db = client.db(process.env.DB_NAME || "novelnest");

  return db.collection("books");
}

const booksCollection = await connectToMongoDB();

// ===============================
// POST API - Add New Book
// ===============================

app.post("/addBooks", upload.single("image"), async (req, res) => {
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

    // Required fields validation
    if (
      !title?.trim() ||
      !author?.trim() ||
      !category?.trim() ||
      !description?.trim() ||
      !userName?.trim() ||
      !userEmail?.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "Required fields are missing",
      });
    }

    // Image validation
    if (!image) {
      return res.status(400).json({
        success: false,
        message: "Book image is required",
      });
    }

    // Total copies validation
    if (
      totalCopies !== undefined &&
      (!Number.isInteger(Number(totalCopies)) ||
        Number(totalCopies) < 1)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid total copies",
      });
    }

    // Book data
    const bookData = {
      title: title.trim(),
      author: author.trim(),
      category: category.trim(),
      description: description.trim(),

      // Image information
      imageName: image.originalname,
      imageMimeType: image.mimetype,
      imageData: image.buffer,

      userName: userName.trim(),
      userEmail: userEmail.trim(),

      createdAt: new Date(),
    };

    if (totalCopies !== undefined) {
      bookData.totalCopies = Number(totalCopies);
    }

    // Save book to MongoDB
    const result = await booksCollection.insertOne(bookData);

    res.status(201).json({
      success: true,
      message: "Book added successfully",
      insertedId: result.insertedId,
    });
  } catch (error) {
    console.error("ADD BOOK ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Failed to add book",
    });
  }
});

// ===============================
// GET API - Get All Books
// ===============================

app.get("/allBooks", async (req, res) => {
  try {
    const books = await booksCollection
      .find({}, { projection: { imageData: 0 } })
      .sort({ createdAt: -1 })
      .toArray();

    res.status(200).json({
      success: true,
      count: books.length,
      data: books,
    });
  } catch (error) {
    console.error("ALL BOOKS ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch books",
    });
  }
});

// ===============================
// GET API - Get Latest 6 Books
// ===============================

app.get("/newArrivals", async (req, res) => {
  try {
    const books = await booksCollection
      .find({}, { projection: { imageData: 0 } })
      .sort({ createdAt: -1 })
      .limit(6)
      .toArray();

    res.status(200).json({
      success: true,
      count: books.length,
      data: books,
    });
  } catch (error) {
    console.error("NEW ARRIVALS ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch new arrivals",
    });
  }
});

// ===============================
// GET API - Get Single Book
// ===============================

app.get("/book/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid book ID",
      });
    }

    const book = await booksCollection.findOne(
      { _id: new ObjectId(id) },
      { projection: { imageData: 0 } }
    );

    if (!book) {
      return res.status(404).json({
        success: false,
        message: "Book not found",
      });
    }

    res.status(200).json({
      success: true,
      data: book,
    });
  } catch (error) {
    console.error("SINGLE BOOK ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch book",
    });
  }
});

// ===============================
// GET API - Get Book Image
// ===============================

app.get("/book-image/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send("Invalid book ID");
    }

    const book = await booksCollection.findOne(
      { _id: new ObjectId(id) },
      {
        projection: {
          imageData: 1,
          imageMimeType: 1,
        },
      }
    );

    if (!book || !book.imageData) {
      return res.status(404).send("Image not found");
    }

    // MongoDB Binary থেকে Buffer তৈরি
    const imageBuffer = book.imageData.buffer
      ? Buffer.from(book.imageData.buffer)
      : Buffer.from(book.imageData);

    res.setHeader("Content-Type", book.imageMimeType);
    res.setHeader("Cache-Control", "public, max-age=3600");

    return res.send(imageBuffer);
  } catch (error) {
    console.error("Image loading error:", error);
    return res.status(500).send("Failed to load image");
  }
});

// ===============================
// Test API
// ===============================

app.get("/", (req, res) => {
  res.send("NovelNest Server is Running!");
});

// ===============================
// Multer Error Handler
// ===============================

app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    return res.status(400).json({
      success: false,
      message:
        error.code === "LIMIT_FILE_SIZE"
          ? "Image size must be less than 5MB"
          : error.message,
    });
  }

  if (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }

  next();
});

// ===============================
// Start Server
// ===============================

app.listen(port, () => {
  console.log(`NovelNest Server running on port ${port}`);
});
