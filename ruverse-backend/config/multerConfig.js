// multerConfig.js
const multer = require('multer');
const path = require('path');

// Configuration for handling audio file uploads
const audioStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/audio/');
    },
    filename: (req, file, cb) => {
        // Construct the new filename using req.body and file.originalname
        const newFileName = `user_${path.parse(file.originalname).name}.wav`;
        cb(null, newFileName);
    }
});

// Multer instance for audio uploads
const uploadAudio = multer({ storage: audioStorage });

// Multer instance for handling form data without files
const uploadNone = multer();

// Export both multer instances
module.exports = {
    uploadAudio,
    uploadNone,
};
