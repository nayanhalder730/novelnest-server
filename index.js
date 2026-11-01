
import express from "express";
import "dotenv/config";
import { MongoClient, ObjectId } from "mongodb";
import cors from "cors";
import multer from "multer";

const app = express();
const port = process.env.PORT || 8000;

// ================= Middleware =================

app.use(
  cors({
    origin: process.env.CLIENT_SITE_URL || "http://localhost:3000",
  })
);

app.use(express.json());

// ================= MongoDB Connection =================

const client = new MongoClient(process.env.MONGODB_URI);

let booksCollection;
let borrowsCollection;

async function connectDB() {
  await client.connect();

  const db = client.db(process.env.DB_NAME || "novelnest");

  booksCollection = db.collection("books");
  borrowsCollection = db.collection("borrows");

  console.log("MongoDB connected successfully");
}

// ================= Multer Configuration =================

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
    ];

    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error("Only JPG, PNG and WEBP images are allowed"));
    }

    cb(null, true);
  },
});

// ================= Helper Functions =================

const allowedCategories = [
  "Fiction",
  "Science",
  "History",
  "Kids",
  "Others",
];

const isValidId = (id) => {
  return (
    ObjectId.isValid(id) &&
    new ObjectId(id).toString() === id
  );
};

const getImageBuffer = (imageData) => {
  if (!imageData) return null;

  if (Buffer.isBuffer(imageData)) {
    return imageData;
  }

  if (imageData.buffer && Buffer.isBuffer(imageData.buffer)) {
    return imageData.buffer;
  }

  return null;
};

// ================= Demo Authentication =================

// Demo authentication only.
// Replace this with verified Better Auth server-side session
// authentication before production.

const requireAuth = (req, res, next) => {
  const email = req.headers["x-user-email"];

  if (!email) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized access",
    });
  }

  req.user = {
    email: email.toLowerCase(),
  };

  next();
};

// ================= 1. GET ALL BOOKS =================

app.get("/books", async (req, res) => {
  try {
    const books = await booksCollection
      .find({})
      .project({ imageData: 0 })
      .sort({ createdAt: -1 })
      .toArray();

    res.status(200).json({
      success: true,
      count: books.length,
      data: books,
    });
  } catch (error) {
    console.error("Get books error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch books",
    });
  }
});

// ================= 2. GET SINGLE BOOK =================

app.get("/books/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid book ID",
      });
    }

    const book = await booksCollection.findOne(
      { _id: new ObjectId(id) },
      {
        projection: { imageData: 0 },
      }
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
    console.error("Get single book error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch book",
    });
  }
});

// ================= 3. ADD BOOK =================

app.post("/books", upload.single("image"), async (req, res) => {
  try {
    const {
      title,
      author,
      category,
      description,
      totalCopies,
      userName,
      userEmail,
    } = req.body;

    // Required field validation
    if (
      !title?.trim() ||
      !author?.trim() ||
      !category ||
      !description?.trim() ||
      !userName?.trim() ||
      !userEmail?.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "All required fields must be provided",
      });
    }

    // Category validation
    if (!allowedCategories.includes(category)) {
      return res.status(400).json({
        success: false,
        message: "Invalid book category",
      });
    }

    // Image validation
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Book image is required",
      });
    }

    // Total copies validation
    const copies = Number(totalCopies);

    if (!Number.isInteger(copies) || copies < 1) {
      return res.status(400).json({
        success: false,
        message: "Total copies must be a positive integer",
      });
    }

    const newBook = {
      title: title.trim(),
      author: author.trim(),
      category,
      description: description.trim(),

      totalCopies: copies,
      availableCopies: copies,

      imageData: req.file.buffer,
      imageMimeType: req.file.mimetype,
      imageName: req.file.originalname,

      userName: userName.trim(),
      userEmail: userEmail.trim().toLowerCase(),

      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await booksCollection.insertOne(newBook);

    res.status(201).json({
      success: true,
      message: "Book added successfully",
      insertedId: result.insertedId,
    });
  } catch (error) {
    console.error("Add book error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to add book",
    });
  }
});

// ================= 4. UPDATE BOOK =================

app.patch("/books/:id", upload.single("image"), async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid book ID",
      });
    }

    const existingBook = await booksCollection.findOne({
      _id: new ObjectId(id),
    });

    if (!existingBook) {
      return res.status(404).json({
        success: false,
        message: "Book not found",
      });
    }

    const {
      title,
      author,
      category,
      description,
      totalCopies,
    } = req.body;

    const updateData = {};

    if (title !== undefined) {
      if (!title.trim()) {
        return res.status(400).json({
          success: false,
          message: "Title cannot be empty",
        });
      }

      updateData.title = title.trim();
    }

    if (author !== undefined) {
      if (!author.trim()) {
        return res.status(400).json({
          success: false,
          message: "Author cannot be empty",
        });
      }

      updateData.author = author.trim();
    }

    // Category validation
    if (category !== undefined) {
      if (!allowedCategories.includes(category)) {
        return res.status(400).json({
          success: false,
          message: "Invalid book category",
        });
      }

      updateData.category = category;
    }

    if (description !== undefined) {
      if (!description.trim()) {
        return res.status(400).json({
          success: false,
          message: "Description cannot be empty",
        });
      }

      updateData.description = description.trim();
    }

    // Total copies update
    if (totalCopies !== undefined) {
      const copies = Number(totalCopies);

      if (!Number.isInteger(copies) || copies < 1) {
        return res.status(400).json({
          success: false,
          message: "Total copies must be a positive integer",
        });
      }

      const borrowedCopies =
        existingBook.totalCopies - existingBook.availableCopies;

      if (copies < borrowedCopies) {
        return res.status(400).json({
          success: false,
          message: "Total copies cannot be less than borrowed copies",
        });
      }

      updateData.totalCopies = copies;
      updateData.availableCopies = copies - borrowedCopies;
    }

    // Optional image update
    if (req.file) {
      updateData.imageData = req.file.buffer;
      updateData.imageMimeType = req.file.mimetype;
      updateData.imageName = req.file.originalname;
    }

    updateData.updatedAt = new Date();

    const result = await booksCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updateData }
    );

    res.status(200).json({
      success: true,
      message: "Book updated successfully",
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    console.error("Update book error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to update book",
    });
  }
});

// ================= 5. DELETE BOOK =================

app.delete("/books/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid book ID",
      });
    }

    const book = await booksCollection.findOne({
      _id: new ObjectId(id),
    });

    if (!book) {
      return res.status(404).json({
        success: false,
        message: "Book not found",
      });
    }

    const activeBorrow = await borrowsCollection.findOne({
      bookId: new ObjectId(id),
      status: "borrowed",
    });

    if (activeBorrow) {
      return res.status(400).json({
        success: false,
        message: "Cannot delete a book while it is borrowed",
      });
    }

    await booksCollection.deleteOne({
      _id: new ObjectId(id),
    });

    res.status(200).json({
      success: true,
      message: "Book deleted successfully",
    });
  } catch (error) {
    console.error("Delete book error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to delete book",
    });
  }
});

// ================= 6. BORROW BOOK =================

app.post("/borrows", requireAuth, async (req, res) => {
  try {
    const { bookId } = req.body;

    if (!bookId || !isValidId(bookId)) {
      return res.status(400).json({
        success: false,
        message: "Valid book ID is required",
      });
    }

    // Atomically decrease available copies
    const result = await booksCollection.updateOne(
      {
        _id: new ObjectId(bookId),
        availableCopies: { $gt: 0 },
      },
      {
        $inc: { availableCopies: -1 },
      }
    );

    if (result.modifiedCount === 0) {
      const book = await booksCollection.findOne({
        _id: new ObjectId(bookId),
      });

      if (!book) {
        return res.status(404).json({
          success: false,
          message: "Book not found",
        });
      }

      return res.status(400).json({
        success: false,
        message: "No available copies",
      });
    }

    try {
      const borrowData = {
        bookId: new ObjectId(bookId),
        userEmail: req.user.email,
        borrowDate: new Date(),
        status: "borrowed",
        returnedAt: null,
      };

      const borrowResult = await borrowsCollection.insertOne(borrowData);

      res.status(201).json({
        success: true,
        message: "Book borrowed successfully",
        insertedId: borrowResult.insertedId,
      });
    } catch (insertError) {
      // Restore available copy if borrow insertion fails
      await booksCollection.updateOne(
        { _id: new ObjectId(bookId) },
        { $inc: { availableCopies: 1 } }
      );

      throw insertError;
    }
  } catch (error) {
    console.error("Borrow book error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to borrow book",
    });
  }
});

// ================= 7. GET USER BORROWS =================

app.get("/borrows", requireAuth, async (req, res) => {
  try {
    const borrows = await borrowsCollection
      .aggregate([
        {
  $match: {
    userEmail: req.user.email,
    status: "borrowed",
  },
},
        {
          $lookup: {
            from: "books",
            localField: "bookId",
            foreignField: "_id",
            as: "book",
          },
        },
        {
          $unwind: {
            path: "$book",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $project: {
            "book.imageData": 0,
          },
        },
        {
          $sort: {
            borrowDate: -1,
          },
        },
      ])
      .toArray();

    res.status(200).json({
      success: true,
      count: borrows.length,
      data: borrows,
    });
  } catch (error) {
    console.error("Get borrows error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch borrowed books",
    });
  }
});

// ================= 8. RETURN BOOK =================

app.delete("/borrows/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid borrow ID",
      });
    }

    const borrow = await borrowsCollection.findOne({
      _id: new ObjectId(id),
      userEmail: req.user.email,
      status: "borrowed",
    });

    if (!borrow) {
      return res.status(404).json({
        success: false,
        message: "Active borrow record not found",
      });
    }

    // Mark borrow as returned
    const result = await borrowsCollection.updateOne(
      {
        _id: new ObjectId(id),
        userEmail: req.user.email,
        status: "borrowed",
      },
      {
        $set: {
          status: "returned",
          returnedAt: new Date(),
        },
      }
    );

    if (result.modifiedCount === 0) {
      return res.status(400).json({
        success: false,
        message: "This book has already been returned",
      });
    }

    // Restore available copy
    await booksCollection.updateOne(
      { _id: borrow.bookId },
      { $inc: { availableCopies: 1 } }
    );

    res.status(200).json({
      success: true,
      message: "Book returned successfully",
    });
  } catch (error) {
    console.error("Return book error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to return book",
    });
  }
});

// ================= BOOK IMAGE =================

// Utility endpoint (additional to the 8 API routes)

app.get("/book-image/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
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

    const imageBuffer = getImageBuffer(book.imageData);

    if (!imageBuffer) {
      return res.status(404).send("Image data not found");
    }

    res.set("Content-Type", book.imageMimeType || "image/jpeg");
    res.set("Cache-Control", "public, max-age=86400");

    res.send(imageBuffer);
  } catch (error) {
    console.error("Book image error:", error);

    res.status(500).send("Failed to load image");
  }
});

// ================= Error Handling =================

app.use((error, req, res, next) => {
  console.error("Server error:", error);

  if (error instanceof multer.MulterError) {
    return res.status(400).json({
      success: false,
      message:
        error.code === "LIMIT_FILE_SIZE"
          ? "Image size must be less than 5 MB"
          : error.message,
    });
  }

  res.status(400).json({
    success: false,
    message: error.message || "Something went wrong",
  });
});

// ================= Start Server =================

async function startServer() {
  try {
    await connectDB();

    app.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

startServer();
