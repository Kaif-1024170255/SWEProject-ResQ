import mongoose from 'mongoose';

let bucket: mongoose.mongo.GridFSBucket | null = null;

/**
 * Retrieves or initializes the GridFS bucket for persistent evidence storage.
 * Attaches dynamically to the active mongoose connection.
 */
export function getGridFSBucket(): mongoose.mongo.GridFSBucket {
  if (!mongoose.connection.db) {
    throw new Error('Database connection is not established. Cannot access GridFS bucket.');
  }

  // Re-instantiate if connection changed or not initialized
  if (!bucket || (bucket as any).s?.db !== mongoose.connection.db) {
    bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
      bucketName: 'evidence',
    });
  }

  return bucket;
}

export interface GridFSUploadOptions {
  contentType: string;
  metadata?: Record<string, any>;
}

/**
 * Validates real binary signatures (magic bytes) for permitted file types.
 * Prevents file-extension spoofing (e.g. .exe disguised as .jpg).
 */
export function validateFileMagicBytes(buffer: Buffer): { isValid: boolean; detectedMime?: string } {
  if (!buffer || buffer.length < 4) {
    return { isValid: false };
  }

  // JPEG signature: 0xFF 0xD8 0xFF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { isValid: true, detectedMime: 'image/jpeg' };
  }

  // PNG signature: 0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { isValid: true, detectedMime: 'image/png' };
  }

  // WebP signature: 'RIFF' at 0..3 and 'WEBP' at 8..11
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 && // R
    buffer[1] === 0x49 && // I
    buffer[2] === 0x46 && // F
    buffer[3] === 0x46 && // F
    buffer[8] === 0x57 && // W
    buffer[9] === 0x45 && // E
    buffer[10] === 0x42 && // B
    buffer[11] === 0x50 // P
  ) {
    return { isValid: true, detectedMime: 'image/webp' };
  }

  // PDF signature: '%PDF-' (0x25 0x50 0x44 0x46 0x2D)
  if (
    buffer.length >= 5 &&
    buffer[0] === 0x25 && // %
    buffer[1] === 0x50 && // P
    buffer[2] === 0x44 && // D
    buffer[3] === 0x46 && // F
    buffer[4] === 0x2d // -
  ) {
    return { isValid: true, detectedMime: 'application/pdf' };
  }

  return { isValid: false };
}

/**
 * Uploads a file buffer directly to MongoDB GridFS.
 * File chunks and files documents are stored in evidence.chunks and evidence.files.
 */
export async function uploadToGridFS(
  buffer: Buffer,
  filename: string,
  options: GridFSUploadOptions
): Promise<mongoose.Types.ObjectId> {
  const gridFsBucket = getGridFSBucket();

  return new Promise((resolve, reject) => {
    const uploadStream = gridFsBucket.openUploadStream(filename, {
      metadata: {
        contentType: options.contentType,
        ...options.metadata,
      },
    });

    uploadStream.on('error', async (err) => {
      // Clean up partial chunks if stream encountered an error
      try {
        await gridFsBucket.delete(uploadStream.id);
      } catch (_cleanupErr) {
        // Ignore deletion error during cleanup
      }
      reject(err);
    });

    uploadStream.on('finish', () => {
      resolve(uploadStream.id as mongoose.Types.ObjectId);
    });

    uploadStream.end(buffer);
  });
}

/**
 * Opens a download stream from GridFS for the specified file ID.
 */
export function downloadStreamFromGridFS(fileId: mongoose.Types.ObjectId | string): mongoose.mongo.GridFSBucketReadStream {
  const gridFsBucket = getGridFSBucket();
  const objectId = typeof fileId === 'string' ? new mongoose.Types.ObjectId(fileId) : fileId;
  return gridFsBucket.openDownloadStream(objectId);
}

/**
 * Finds file metadata record from evidence.files in GridFS.
 */
export async function findGridFSFile(fileId: mongoose.Types.ObjectId | string): Promise<any | null> {
  const gridFsBucket = getGridFSBucket();
  const objectId = typeof fileId === 'string' ? new mongoose.Types.ObjectId(fileId) : fileId;
  const files = await gridFsBucket.find({ _id: objectId }).toArray();
  return files[0] || null;
}

/**
 * Safely deletes a file and its chunks from GridFS.
 * If file does not exist, succeeds silently without throwing.
 */
export async function deleteFromGridFS(fileId: mongoose.Types.ObjectId | string): Promise<void> {
  const gridFsBucket = getGridFSBucket();
  const objectId = typeof fileId === 'string' ? new mongoose.Types.ObjectId(fileId) : fileId;

  try {
    await gridFsBucket.delete(objectId);
  } catch (err: any) {
    // If the file is already deleted or not found, treat as succeeded
    if (err && (err.message?.includes('FileNotFound') || err.code === 'ENOENT')) {
      return;
    }
    throw err;
  }
}
