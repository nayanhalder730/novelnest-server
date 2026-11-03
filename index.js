
import express from "express";
import "dotenv/config";
import { ObjectId } from "mongodb";
import cors from "cors";
import multer from "multer";

import { db, connectDB } from "./auth.js";
import requireAuth from "./middleware/authMiddleware.js";

const app = express();
const PORT = process.env.PORT || 8000;

// ==================== Middleware ====================

const allowedOrigins = (
  process.env.CLIENT_SITE_URL || "http://localhost:3000"
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());

// ==================== Collections ====================

const booksCollection = db.collection("books");
const borrowsCollection = db.collection("borrows");

// ==================== Multer Configuration ====================

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
      return cb(
        new Error("Only JPG, PNG and WEBP images are allowed.")
      );
    }

    cb(null, true);
  },
});

// ==================== Helpers ====================

const allowedCategories = [
  "Fiction",
  "Science",
  "History",
  "Kids",
  "Others",
];

const isValidId = (id) => ObjectId.isValid(id);

const getBookId = (id) => new ObjectId(id);

const getImageBuffer = (imageData) => {
  if (!imageData) return null;

  if (Buffer.isBuffer(imageData)) {
    return imageData;
  }

  if (imageData.buffer) {
    return Buffer.from(imageData.buffer);
  }

  return null;
};

const parseCopies = (value) => {
  const copies = Number(value);

  if (!Number.isInteger(copies) || copies < 1) {
    return null;
  }

  return copies;
};

// ==================== ImgBB Upload ====================

const uploadImageToImgBB = async (file) => {
  const apiKey = process.env.IMGBB_API_KEY;

  if (!apiKey) {
    throw new Error(
      "IMGBB_API_KEY is not configured on the server."
    );
  }

  const formData = new FormData();

  const imageBlob = new Blob([file.buffer], {
    type: file.mimetype,
  });

  formData.append("image", imageBlob, file.originalname);

  const response = await fetch(
    `https://api.imgbb.com/1/upload?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      body: formData,
    }
  );

  const result = await response.json().catch(() => null);

  if (
    !response.ok ||
    !result?.success ||
    !result?.data?.url
  ) {
    console.error("ImgBB upload failed:", result);

    throw new Error(
      "Unable to upload book image. Please try again."
    );
  }

  return {
    imageUrl: result.data.url,
    imageName:
      result.data.image?.filename || file.originalname,
    imageMimeType:
      result.data.image?.mime || file.mimetype,
  };
};

const publicBookProjection = {
  imageData: 0,
};

// ==================== Public Routes ====================

// Server status
app.get("/", (req, res) => {
  res.send("NovelNest API is running successfully.");
});

// Get all books
const getAllBooks = async (req, res) => {
  try {
    const books = await booksCollection
      .find({}, { projection: publicBookProjection })
      .sort({ createdAt: -1 })
      .toArray();

    res.status(200).json({
      success: true,
      count: books.length,
      books,
    });
  } catch (error) {
    console.error("Get books error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch books.",
    });
  }
};

app.get("/books", getAllBooks);

// Compatibility route
app.get("/allBooks", getAllBooks);

// Get single book details
app.get("/books/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid book ID.",
      });
    }

    const book = await booksCollection.findOne(
      { _id: getBookId(id) },
      { projection: publicBookProjection }
    );

    if (!book) {
      return res.status(404).json({
        success: false,
        message: "Book not found.",
      });
    }

    res.status(200).json({
      success: true,
      book,
    });
  } catch (error) {
    console.error("Get book details error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch book details.",
    });
  }
});

// ==================== Protected Routes ====================

// Check current authenticated user
app.get("/auth/me", requireAuth, (req, res) => {
  res.status(200).json({
    success: true,
    user: req.user,
  });
});

// ==================== Add Book ====================

app.post(
  "/books",
  requireAuth,
  upload.single("image"),
  async (req, res) => {
    try {
      const {
        title,
        author,
        category,
        description,
        totalCopies,
      } = req.body;

      const copies = parseCopies(totalCopies);

      if (
        !title?.trim() ||
        !author?.trim() ||
        !category ||
        !description?.trim()
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Please provide all required book information.",
        });
      }

      if (!allowedCategories.includes(category)) {
        return res.status(400).json({
          success: false,
          message: "Invalid book category.",
        });
      }

      if (!copies) {
        return res.status(400).json({
          success: false,
          message:
            "Total copies must be a positive integer.",
        });
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "Book image is required.",
        });
      }

      const uploadedImage = await uploadImageToImgBB(req.file);

      const newBook = {
        title: title.trim(),
        author: author.trim(),
        category,
        description: description.trim(),

        totalCopies: copies,
        availableCopies: copies,

        imageUrl: uploadedImage.imageUrl,
        imageMimeType: uploadedImage.imageMimeType,
        imageName: uploadedImage.imageName,

        userId: req.user.id,
        userName: req.user.name,
        userEmail: req.user.email,

        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await booksCollection.insertOne(newBook);

      res.status(201).json({
        success: true,
        message: "Book added successfully.",
        bookId: result.insertedId,
      });
    } catch (error) {
      console.error("Add book error:", error);

      res.status(500).json({
        success: false,
        message:
          error.message || "Failed to add book.",
      });
    }
  }
);

// ==================== My Collection ====================

app.get("/my-books", requireAuth, async (req, res) => {
  try {
    const books = await booksCollection
      .find(
        { userId: req.user.id },
        { projection: publicBookProjection }
      )
      .sort({ createdAt: -1 })
      .toArray();

    res.status(200).json({
      success: true,
      count: books.length,
      books,
    });
  } catch (error) {
    console.error("My books error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch your books.",
    });
  }
});

// ==================== Update Book ====================

app.patch(
  "/books/:id",
  requireAuth,
  upload.single("image"),
  async (req, res) => {
    try {
      const { id } = req.params;

      if (!isValidId(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid book ID.",
        });
      }

      const bookId = getBookId(id);

      const existingBook = await booksCollection.findOne({
        _id: bookId,
        userId: req.user.id,
      });

      if (!existingBook) {
        return res.status(404).json({
          success: false,
          message:
            "Book not found or you are not the owner.",
        });
      }

      const {
        title,
        author,
        category,
        description,
        totalCopies,
      } = req.body;

      const updateData = {
        updatedAt: new Date(),
      };

      if (title !== undefined) {
        if (!title.trim()) {
          return res.status(400).json({
            success: false,
            message: "Book title cannot be empty.",
          });
        }

        updateData.title = title.trim();
      }

      if (author !== undefined) {
        if (!author.trim()) {
          return res.status(400).json({
            success: false,
            message: "Author name cannot be empty.",
          });
        }

        updateData.author = author.trim();
      }

      if (category !== undefined) {
        if (!allowedCategories.includes(category)) {
          return res.status(400).json({
            success: false,
            message: "Invalid book category.",
          });
        }

        updateData.category = category;
      }

      if (description !== undefined) {
        if (!description.trim()) {
          return res.status(400).json({
            success: false,
            message: "Description cannot be empty.",
          });
        }

        updateData.description = description.trim();
      }

      if (totalCopies !== undefined) {
        const copies = parseCopies(totalCopies);

        if (!copies) {
          return res.status(400).json({
            success: false,
            message:
              "Total copies must be a positive integer.",
          });
        }

        const borrowedCopies =
          existingBook.totalCopies -
          existingBook.availableCopies;

        if (copies < borrowedCopies) {
          return res.status(400).json({
            success: false,
            message: `At least ${borrowedCopies} copies are currently borrowed.`,
          });
        }

        updateData.totalCopies = copies;
        updateData.availableCopies = copies - borrowedCopies;
      }

      if (req.file) {
        const uploadedImage = await uploadImageToImgBB(req.file);

        updateData.imageUrl = uploadedImage.imageUrl;
        updateData.imageMimeType =
          uploadedImage.imageMimeType;
        updateData.imageName = uploadedImage.imageName;
      }

      const updateOperation = {
        $set: updateData,
      };

      // Remove old MongoDB binary after ImgBB replacement.
      if (req.file) {
        updateOperation.$unset = {
          imageData: "",
        };
      }

      const result = await booksCollection.updateOne(
        {
          _id: bookId,
          userId: req.user.id,
        },
        updateOperation
      );

      if (!result.matchedCount) {
        return res.status(404).json({
          success: false,
          message: "Book not found.",
        });
      }

      res.status(200).json({
        success: true,
        message: "Book updated successfully.",
      });
    } catch (error) {
      console.error("Update book error:", error);

      res.status(500).json({
        success: false,
        message:
          error.message || "Failed to update book.",
      });
    }
  }
);

// ==================== Delete Book ====================

app.delete("/books/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    // Validate book ID
    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid book ID.",
      });
    }

    const bookId = getBookId(id);

    // Check book ownership
    const book = await booksCollection.findOne({
      _id: bookId,
      userId: req.user.id,
    });

    if (!book) {
      return res.status(404).json({
        success: false,
        message: "Book not found or you are not the owner.",
      });
    }

    // Check active borrow
    const activeBorrow = await borrowsCollection.findOne({
      bookId: bookId,
      status: "borrowed",
    });

    if (activeBorrow) {
      return res.status(409).json({
        success: false,
        message:
          "This book cannot be deleted because it is currently borrowed. Please wait until it is returned.",
      });
    }

    // Delete book
    const result = await booksCollection.deleteOne({
      _id: bookId,
      userId: req.user.id,
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Book could not be deleted.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Book deleted successfully.",
    });
  } catch (error) {
    console.error("Delete book error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to delete book.",
    });
  }
});

// ==================== Borrow Book ====================

app.post("/borrows", requireAuth, async (req, res) => {
  let reservedBookId = null;

  try {
    const { bookId } = req.body;

    if (!bookId || !isValidId(bookId)) {
      return res.status(400).json({
        success: false,
        message: "A valid book ID is required.",
      });
    }

    const objectBookId = getBookId(bookId);

    const existingBorrow = await borrowsCollection.findOne({
      bookId: objectBookId,
      userId: req.user.id,
      status: "borrowed",
    });

    if (existingBorrow) {
      return res.status(409).json({
        success: false,
        message: "You have already borrowed this book.",
      });
    }

    const reservation = await booksCollection.updateOne(
      {
        _id: objectBookId,
        availableCopies: { $gt: 0 },
      },
      {
        $inc: { availableCopies: -1 },
        $set: { updatedAt: new Date() },
      }
    );

    if (!reservation.modifiedCount) {
      const bookExists = await booksCollection.findOne(
        { _id: objectBookId },
        { projection: { _id: 1 } }
      );

      return res.status(bookExists ? 400 : 404).json({
        success: false,
        message: bookExists
          ? "No copies are currently available."
          : "Book not found.",
      });
    }

    reservedBookId = objectBookId;

    const borrowedBook = await booksCollection.findOne(
      { _id: objectBookId },
      {
        projection: {
          title: 1,
          imageName: 1,
        },
      }
    );

    const borrowDate = new Date();
    const returnDate = new Date(borrowDate);
    returnDate.setUTCDate(returnDate.getUTCDate() + 7);

    const borrowDocument = {
      bookId: objectBookId,
      bookTitle: borrowedBook?.title || "",
      bookImage: borrowedBook
        ? `/book-image/${borrowedBook._id}`
        : "",
      userId: req.user.id,
      userName: req.user.name,
      userEmail: req.user.email,

      borrowDate,
      returnDate,
      returnedAt: null,
      status: "borrowed",
    };

    const result = await borrowsCollection.insertOne(
      borrowDocument
    );

    reservedBookId = null;

    res.status(201).json({
      success: true,
      message: "Book borrowed successfully.",
      borrowId: result.insertedId,
    });
  } catch (error) {
    console.error("Borrow book error:", error);

    if (reservedBookId) {
      try {
        await booksCollection.updateOne(
          { _id: reservedBookId },
          {
            $inc: { availableCopies: 1 },
            $set: { updatedAt: new Date() },
          }
        );
      } catch (rollbackError) {
        console.error(
          "Borrow rollback error:",
          rollbackError
        );
      }
    }

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "You have already borrowed this book.",
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to borrow book.",
    });
  }
});

// ==================== My Borrows ====================

app.get("/borrows", requireAuth, async (req, res) => {
  try {
    const borrows = await borrowsCollection
      .aggregate([
        {
          $match: {
            userId: req.user.id,
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
      borrows,
    });
  } catch (error) {
    console.error("Get borrows error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch borrow history.",
    });
  }
});

// ==================== Return Book ====================

app.delete("/borrows/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid borrow ID.",
      });
    }

    const borrowId = getBookId(id);

    const borrow = await borrowsCollection.findOne({
      _id: borrowId,
      userId: req.user.id,
      status: "borrowed",
    });

    if (!borrow) {
      return res.status(404).json({
        success: false,
        message: "Active borrow record not found.",
      });
    }

    const updateResult = await borrowsCollection.updateOne(
      {
        _id: borrowId,
        userId: req.user.id,
        status: "borrowed",
      },
      {
        $set: {
          status: "returned",
          returnedAt: new Date(),
        },
      }
    );

    if (!updateResult.modifiedCount) {
      return res.status(409).json({
        success: false,
        message: "This book has already been returned.",
      });
    }

    const bookResult = await booksCollection.updateOne(
      { _id: borrow.bookId },
      {
        $inc: { availableCopies: 1 },
        $set: { updatedAt: new Date() },
      }
    );

    if (!bookResult.matchedCount) {
      await borrowsCollection.updateOne(
        {
          _id: borrowId,
          userId: req.user.id,
          status: "returned",
        },
        {
          $set: {
            status: "borrowed",
            returnedAt: null,
          },
        }
      );

      return res.status(500).json({
        success: false,
        message:
          "Book inventory could not be updated. Please try again.",
      });
    }

    res.status(200).json({
      success: true,
      message: "Book returned successfully.",
    });
  } catch (error) {
    console.error("Return book error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to return book.",
    });
  }
});

// ==================== Book Image ====================


app.get("/book-image/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).send("Invalid book ID.");
    }

    const book = await booksCollection.findOne(
      { _id: getBookId(id) },
      {
        projection: {
          imageUrl: 1,
          imageData: 1,
          imageMimeType: 1,
        },
      }
    );

    if (!book) {
      return res.status(404).send("Book image not found.");
    }

    // New ImgBB images use redirect.
    if (book.imageUrl) {
      res.set({
        "Cache-Control":
          "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
        Pragma: "no-cache",
        Expires: "0",
        "X-Content-Type-Options": "nosniff",
      });

      return res.redirect(302, book.imageUrl);
    }

    // Legacy MongoDB binary image support.
    if (!book.imageData) {
      return res.status(404).send("Book image not found.");
    }

    const imageBuffer = getImageBuffer(book.imageData);

    if (!imageBuffer) {
      return res.status(404).send("Book image not found.");
    }

    res.set({
      "Content-Type": book.imageMimeType || "image/jpeg",
      "Cache-Control":
        "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
      Pragma: "no-cache",
      Expires: "0",
      "X-Content-Type-Options": "nosniff",
    });

    return res.send(imageBuffer);
  } catch (error) {
    console.error("Get book image error:", error);

    res.status(500).send("Failed to load book image.");
  }
});


// ==================== Error Handler ====================

app.use((error, req, res, next) => {
  console.error("API error:", error);

  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        success: false,
        message: "Image size cannot exceed 5MB.",
      });
    }

    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }

  if (error.message?.includes("Only JPG")) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }

  res.status(500).json({
    success: false,
    message: "Internal server error.",
  });
});

// ==================== Start Server ====================

const startServer = async () => {
  try {
    await connectDB();

    await borrowsCollection.createIndex(
      { bookId: 1, userId: 1 },
      {
        unique: true,
        partialFilterExpression: {
          status: "borrowed",
        },
        name: "unique_active_borrow_per_user_book",
      }
    );

    app.listen(PORT, () => {
      console.log(
        `NovelNest server running on port ${PORT}`
      );
    });
  } catch (error) {
    console.error("Server startup failed:", error);
    process.exit(1);
  }
};

startServer();
