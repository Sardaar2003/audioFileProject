const fs = require('fs');
const path = require('path');
const FilePair = require('../models/FilePair');
const { FILE_STATUSES } = require('../constants/statuses');
const { uploadToS3, generateS3Key } = require('./s3Service');

const SUPPORTED_EXTENSIONS = ['.mp3', '.txt'];

const cleanupFileSafe = (filePath) => {
  if (!filePath) return;
  fs.promises
    .access(filePath)
    .then(() => fs.promises.unlink(filePath))
    .catch(() => {});
};

const buildPairs = (files) => {
  console.log('🔍 [uploadService] buildPairs called with', files.length, 'files');
  const pairMap = new Map();

  files.forEach((file) => {
    const ext = path.extname(file.originalname).toLowerCase();
    console.log('🔍 [uploadService] Processing file:', file.originalname, 'ext:', ext);
    if (!SUPPORTED_EXTENSIONS.includes(ext)) {
      console.log('⚠️  [uploadService] Unsupported extension, skipping:', file.originalname);
      cleanupFileSafe(file.path);
      return;
    }

    const baseName = path.basename(file.originalname, ext);
    if (!pairMap.has(baseName)) {
      pairMap.set(baseName, { audio: null, text: null });
    }

    if (ext === '.mp3') {
      pairMap.get(baseName).audio = file;
      console.log('🎵 [uploadService] Added audio for:', baseName);
    } else if (ext === '.txt') {
      pairMap.get(baseName).text = file;
      console.log('📄 [uploadService] Added text for:', baseName);
    }
  });

  const merged = [];
  pairMap.forEach((value, key) => {
    if (value.audio && value.text) {
      merged.push({ baseName: key, audio: value.audio, text: value.text });
      console.log('✅ [uploadService] Valid pair found:', key);
    } else {
      console.log('⚠️  [uploadService] Incomplete pair, skipping:', key, {
        hasAudio: !!value.audio,
        hasText: !!value.text,
      });
      cleanupFileSafe(value.audio?.path);
      cleanupFileSafe(value.text?.path);
    }
  });

  console.log('✅ [uploadService] buildPairs completed. Valid pairs:', merged.length);
  return merged;
};

const persistPairs = async ({ uploader, uploaderName, pairs }) => {
  console.log('💾 [uploadService] persistPairs called for', pairs.length, 'pairs');
  console.log('💾 [uploadService] Uploader:', uploader.toString(), uploaderName);
  const saved = [];
  const duplicates = [];

  for (let i = 0; i < pairs.length; i++) {
    const pair = pairs[i];
    console.log(`\n📦 [uploadService] Processing pair ${i + 1}/${pairs.length}:`, pair.baseName);

    console.log('🔍 [uploadService] Checking for duplicates...');
    const exists = await FilePair.findOne({ baseName: pair.baseName, uploader }).lean();
    if (exists) {
      console.log('⚠️  [uploadService] Duplicate found, skipping:', pair.baseName);
      duplicates.push(pair.baseName);
      cleanupFileSafe(pair.audio.path);
      cleanupFileSafe(pair.text.path);
      continue;
    }

    console.log('📖 [uploadService] Reading files from disk...');
    console.log('📖 [uploadService] Audio path:', pair.audio.path);
    console.log('📖 [uploadService] Text path:', pair.text.path);
    // Read files from disk
    const [audioBuffer, textBuffer] = await Promise.all([
      fs.promises.readFile(pair.audio.path),
      fs.promises.readFile(pair.text.path),
    ]);
    console.log('✅ [uploadService] Files read. Audio size:', audioBuffer.length, 'bytes, Text size:', textBuffer.length, 'bytes');

    // Generate S3 keys
    const audioS3Key = generateS3Key(uploader.toString(), pair.baseName, '.mp3');
    const textS3Key = generateS3Key(uploader.toString(), pair.baseName, '.txt');
    console.log('🔑 [uploadService] Generated S3 keys:');
    console.log('🔑 [uploadService]   Audio:', audioS3Key);
    console.log('🔑 [uploadService]   Text:', textS3Key);

    // Upload to S3
    console.log('☁️  [uploadService] Uploading to S3...');
    try {
      await Promise.all([
        uploadToS3(audioBuffer, audioS3Key, pair.audio.mimetype || 'audio/mpeg'),
        uploadToS3(Buffer.from(textBuffer), textS3Key, 'text/plain; charset=utf-8'),
      ]);
      console.log('✅ [uploadService] S3 upload successful');
    } catch (error) {
      console.error('❌ [uploadService] S3 upload failed:', error.message);
      // Clean up temp files if S3 upload fails
      cleanupFileSafe(pair.audio.path);
      cleanupFileSafe(pair.text.path);
      throw new Error(`Failed to upload ${pair.baseName} to S3: ${error.message}`);
    }

    // Store metadata in MongoDB with S3 keys
    console.log('💾 [uploadService] Saving to MongoDB...');
    const doc = await FilePair.create({
      baseName: pair.baseName,
      audioS3Key,
      textS3Key,
      audioMimeType: pair.audio.mimetype || 'audio/mpeg',
      uploader,
      uploaderName,
      status: FILE_STATUSES.PROCESSING,
      uploadedAt: new Date(),
    });
    console.log('✅ [uploadService] MongoDB save successful. ID:', doc._id);

    // Clean up local temp files
    console.log('🧹 [uploadService] Cleaning up temp files...');
    cleanupFileSafe(pair.audio.path);
    cleanupFileSafe(pair.text.path);

    saved.push(doc);
    console.log('✅ [uploadService] Pair', pair.baseName, 'completed successfully');
  }

  console.log('✅ [uploadService] persistPairs completed. Saved:', saved.length, 'Duplicates:', duplicates.length);
  return { saved, duplicates };
};

const processUploadBatch = async ({ files, uploader, uploaderName }) => {
  console.log('\n🚀 [uploadService] processUploadBatch started');
  console.log('🚀 [uploadService] Total files received:', files.length);
  console.log('🚀 [uploadService] Uploader ID:', uploader.toString());
  console.log('🚀 [uploadService] Uploader name:', uploaderName);

  const pairs = buildPairs(files);
  if (!pairs.length) {
    console.log('⚠️  [uploadService] No valid pairs found after processing');
    return { saved: [], duplicates: [], summary: { validPairs: 0, uniqueFilenames: 0, completedUploads: 0 } };
  }

  console.log('📊 [uploadService] Valid pairs to process:', pairs.length);
  const { saved, duplicates } = await persistPairs({ uploader, uploaderName, pairs });
  const validPairs = saved.length;

  const summary = {
    validPairs,
    uniqueFilenames: new Set(saved.map((doc) => doc.baseName)).size,
    completedUploads: validPairs,
  };

  console.log('✅ [uploadService] processUploadBatch completed');
  console.log('📊 [uploadService] Final summary:', summary);
  console.log('📊 [uploadService] Duplicates skipped:', duplicates);

  return {
    saved,
    duplicates,
    summary,
  };
};

module.exports = { processUploadBatch };


