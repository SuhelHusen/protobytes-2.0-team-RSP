import fs from "fs";
import { randomUUID } from "crypto";
import multer, { FileFilterCallback } from "multer";
import path from "path";

const uploadDir = path.resolve(__dirname, "../../uploads");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();
    cb(null, `${randomUUID()}${extension || ".pdf"}`);
  },
});

const fileFilter = (
  _req: Express.Request,
  file: Express.Multer.File,
  cb: FileFilterCallback
): void => {
  if (file.mimetype === "application/pdf") {
    cb(null, true);
    return;
  }

  cb(new Error("Only PDF files are allowed"));
};

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: Number(process.env.UPLOAD_MAX_SIZE || 50 * 1024 * 1024),
  },
});
