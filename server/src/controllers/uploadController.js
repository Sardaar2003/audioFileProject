const FilePair = require('../models/FilePair');
const asyncHandler = require('../utils/asyncHandler');
const { processUploadBatch } = require('../services/uploadService');
const { downloadFromS3, uploadToS3, generateS3Key } = require('../services/s3Service');
const { QA_TEAMS, ROLES } = require('../constants/roles');

const uploadFolder = asyncHandler(async (req, res) => {
  console.log('📤 [uploadController] uploadFolder called');
  console.log('📤 [uploadController] Files received:', req.files?.length || 0);
  console.log('📤 [uploadController] Uploader:', req.user?.id, req.user?.name);

  if (!req.files || !req.files.length) {
    console.log('❌ [uploadController] No files provided');
    res.status(400);
    throw new Error('No files were provided');
  }

  console.log('📤 [uploadController] Calling processUploadBatch...');
  try {
    const { saved, duplicates, summary } = await processUploadBatch({
      files: req.files,
      uploader: req.user.id,
      uploaderName: req.user.name,
    });

    console.log('✅ [uploadController] processUploadBatch completed');
    console.log('✅ [uploadController] Saved:', saved.length, 'Duplicates:', duplicates.length);
    console.log('✅ [uploadController] Summary:', summary);

    res.status(201).json({
      success: true,
      summary,
      duplicatesSkipped: duplicates,
      savedIds: saved.map((doc) => doc._id),
    });
  } catch (error) {
    console.error('❌ [uploadController] Error in processUploadBatch:', error.message);
    console.error('❌ [uploadController] Stack:', error.stack);
    throw error;
  }
});

const getMyUploads = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, status = '', search = '' } = req.query;
  const filters = { uploader: req.user.id };

  if (status) {
    filters.status = status;
  }

  if (search) {
    filters.baseName = { $regex: search, $options: 'i' };
  }

  const skip = (Number(page) - 1) * Number(limit);

  const [items, total] = await Promise.all([
    FilePair.find(filters).sort({ uploadedAt: -1 }).skip(skip).limit(Number(limit)),
    FilePair.countDocuments(filters),
  ]);

  res.json({
    success: true,
    data: items,
    pagination: {
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)) || 1,
    },
  });
});

const canAccessText = (user, filePair) => {
  if (!user || !filePair) return false;
  if (user.role === ROLES.ADMIN || user.role === ROLES.QA_MANAGER) return true;
  if (QA_TEAMS.includes(user.role)) return true;
  return filePair.uploader.toString() === user.id.toString();
};

const getTextContent = asyncHandler(async (req, res) => {
  const { filePairId } = req.params;
  const filePair = await FilePair.findById(filePairId);

  if (!filePair) {
    res.status(404);
    throw new Error('File pair not found');
  }

  if (!canAccessText(req.user, filePair)) {
    res.status(403);
    throw new Error('You are not allowed to view this text');
  }

  // Get original text from S3
  const textBuffer = await downloadFromS3(filePair.textS3Key);
  const textContent = textBuffer.toString('utf8');

  // Get review text from S3 if it exists
  let reviewContent = '';
  if (filePair.reviewTextS3Key) {
    try {
      const reviewBuffer = await downloadFromS3(filePair.reviewTextS3Key);
      reviewContent = reviewBuffer.toString('utf8');
    } catch (error) {
      // Review text doesn't exist yet, that's fine
      reviewContent = '';
    }
  }

  res.json({
    success: true,
    textContent,
    reviewContent,
    originalPath: filePair.textS3Key,
    editorPath: filePair.reviewTextS3Key || '',
  });
});

const saveEditedText = asyncHandler(async (req, res) => {
  const { filePairId } = req.params;
  const { content } = req.body;

  if (typeof content !== 'string') {
    res.status(400);
    throw new Error('content field is required');
  }

  const filePair = await FilePair.findById(filePairId);
  if (!filePair) {
    res.status(404);
    throw new Error('File pair not found');
  }

  if (!(QA_TEAMS.includes(req.user.role) || req.user.role === ROLES.QA_MANAGER || req.user.role === ROLES.ADMIN)) {
    res.status(403);
    throw new Error('This action is limited to QA and management roles');
  }

  // Generate S3 key for review text (filename.F.txt)
  const reviewS3Key = filePair.reviewTextS3Key || generateS3Key(filePair.uploader.toString(), filePair.baseName, '.F.txt');
  
  // Upload review text to S3
  await uploadToS3(Buffer.from(content, 'utf8'), reviewS3Key, 'text/plain; charset=utf-8');

  // Update metadata in MongoDB
  if (!filePair.reviewTextS3Key) {
    filePair.reviewTextS3Key = reviewS3Key;
    await filePair.save();
  }

  res.json({ success: true, editorPath: reviewS3Key });
});

module.exports = { uploadFolder, getMyUploads, getTextContent, saveEditedText };


