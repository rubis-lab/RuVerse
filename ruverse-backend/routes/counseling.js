// const { newSession, generateResponse, summarizeSession, generateKlleonResponse } = require("../controller/counselingController");
const { newSession, generateResponse, summarizeSession } = require("../controller/counselingController");
const { uploadAudio, uploadNone } = require("../config/multerConfig");
const router = require("express").Router();

router.post('/init', uploadNone.none(), newSession);
router.post('/get_response', uploadAudio.single('audio'), generateResponse);
router.post('/summarize_session', summarizeSession);

// router.post('/get_klleon_response', uploadAudio.single('audio'), generateKlleonResponse);

// WebRTC 스트리밍 라우터 추가
// router.post('/webrtc-stream', generateWebRTCStream);


module.exports = router;