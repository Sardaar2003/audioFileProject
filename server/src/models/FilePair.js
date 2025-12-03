const mongoose = require('mongoose');
const { FILE_STATUSES } = require('../constants/statuses');

const filePairSchema = new mongoose.Schema(
  {
    baseName: { type: String, required: true, trim: true },
    // AWS S3 keys for file storage
    audioS3Key: { type: String, required: true },
    textS3Key: { type: String, required: true },
    audioMimeType: { type: String, default: 'audio/mpeg' },
    // QA edited text stored in S3 (filename.F.txt)
    reviewTextS3Key: { type: String },
    // Metadata
    uploader: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    uploaderName: { type: String, required: true },
    status: {
      type: String,
      enum: Object.values(FILE_STATUSES),
      default: FILE_STATUSES.PROCESSING,
      index: true,
    },
    uploadedAt: { type: Date, default: Date.now, index: true },
    completedAt: { type: Date },
  },
  { timestamps: true }
);

filePairSchema.index({ baseName: 1, uploader: 1 }, { unique: true });

module.exports = mongoose.models.FilePair || mongoose.model('FilePair', filePairSchema);


